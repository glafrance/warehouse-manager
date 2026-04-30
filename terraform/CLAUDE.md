# Project: Low-Cost AWS Infra
## Rules
- Focus ONLY on the /terraform directory.
- Use Opus 4.7 for architecture.
- Do not use NAT Gateways (use VPC Endpoints).
- Infrastructure Only: Do not generate application source code (Java/Angular) unless explicitly requested. Focus on HCL/Terraform.
- **Infrastructure Safety:** ALWAYS run `terraform plan` and show the summary before running `terraform apply`.
- **Approval Flow:** Never run `terraform apply` with the `-auto-approve` flag unless explicitly asked.

## State of the Union (end of day 2026-04-30)

**Last live URLs** — captured before tonight's `terraform destroy`. Both will get **new hostnames** when the stack is rebuilt; do not paste these into anything that needs to keep working across rebuilds.

| Endpoint | Last-known URL |
|---|---|
| Backend (ALB) | `http://warehouse-alb-381158838.us-east-2.elb.amazonaws.com` |
| Backend health | `http://warehouse-alb-381158838.us-east-2.elb.amazonaws.com/actuator/health` (was returning `200 {"status":"UP","groups":["liveness","readiness"]}`) |
| Frontend (CloudFront) | `http://d2nj1zjj63cakw.cloudfront.net` (HTTP intentional — see blockers) |

**What survives the teardown:**

| Resource | AWS ID | Where it lives now | Why preserved |
|---|---|---|---|
| ECR repo `warehouse-api` | `510490942892.dkr.ecr.us-east-2.amazonaws.com/warehouse-api` | AWS only — **not in TF state** | Contains `:v1` image (`linux/arm64`) — saves a `docker buildx --push` next session. Need to `terraform import` tomorrow. |
| S3 bucket `warehouse-frontend-510490942892` | (region us-east-2) | AWS only — **not in TF state** | Contains the synced Angular dist (`index.html`, `main-7HPSAYPT.js`, `styles-5INURTSO.css`, `favicon.ico`) — saves an `ng build` + `aws s3 sync` next session. Need to `terraform import` tomorrow. |
| `aws_s3_bucket_public_access_block.frontend` | (attached to bucket above) | AWS only — **not in TF state** | Lives with the bucket; needs import tomorrow. |
| `aws_s3_bucket_ownership_controls.frontend` | (attached to bucket above) | AWS only — **not in TF state** | Same — needs import tomorrow. |
| `aws_cloudfront_origin_access_control.frontend` | `E2462I5R74TOYT` | AWS **and TF state** | Destroy hit CloudFront's eventual-consistency snag (`OriginAccessControlInUse` 409 even though the distribution it referenced was already deleted). Left in state so tomorrow's plan picks it up no-op. **Do NOT import — already tracked.** |

**Tomorrow's first commands** (in this order):

```bash
# 1. SSO + sanity
aws sso login --profile admin
aws ecr list-images --repository-name warehouse-api --profile admin --region us-east-2  # confirm :v1 still there
aws s3 ls s3://warehouse-frontend-510490942892/ --profile admin                          # confirm Angular dist still there

# 2. Re-import only the four resources that fully fell out of state.
#    Do NOT import the CloudFront OAC — it's still in tfstate from tonight.
terraform import aws_ecr_repository.warehouse_api warehouse-api
terraform import aws_s3_bucket.frontend warehouse-frontend-510490942892
terraform import aws_s3_bucket_public_access_block.frontend warehouse-frontend-510490942892
terraform import aws_s3_bucket_ownership_controls.frontend warehouse-frontend-510490942892

# 3. Now plan + apply normally — should be 0-change for the four imports plus the OAC.
terraform plan -out=morning.tfplan
terraform apply morning.tfplan
```

**If the OAC ever does need cleanup** (e.g., it goes orphaned and you can't delete it because of stale "in use" state on AWS's side): wait 30+ min for CloudFront's metadata to fully settle, then `aws cloudfront delete-origin-access-control --id E2462I5R74TOYT --if-match $(aws cloudfront get-origin-access-control --id E2462I5R74TOYT --query 'ETag' --output text)`. We hit a transient version of this tonight that didn't resolve in 5 min.

**Current blockers (carried forward)**:

1. **Mixed Content / no real HTTPS path.** ALB is HTTP-only on port 80; we sidestepped browser blocking by setting CloudFront's `viewer_protocol_policy = allow-all` so the frontend is reachable over plain HTTP. Real fix is the multi-step migration in Technical Debt: Route53 zone + ACM cert in `us-east-1` (CloudFront) + ACM cert in `us-east-2` (ALB) + 443 listener on the ALB + custom alias on CloudFront + flip viewer policy back to `redirect-to-https` + SPA points at HTTPS API. None of this is in code yet — it's a fresh chunk of work.
2. **JWT/auth flows over plaintext.** Direct consequence of #1. Tokens travel as cleartext between browser, CloudFront edge, the public internet, and the ALB. Nothing to do until #1 is fixed.

**Manual overrides currently in `ecs_task.tf`** (will re-apply on tomorrow's rebuild — they're persisted in code):

| Override | Where | Why | When to remove |
|---|---|---|---|
| `SPRING_JPA_HIBERNATE_DDL_AUTO=update` | `environment[]` block | Bypasses `application-prod.properties`'s `validate` setting so Hibernate auto-creates the schema on a fresh empty RDS. Without this, the freshly-rebuilt DB has no tables and the app fails JPA bean creation. | When Flyway/Liquibase migrations are added to the Spring Boot app. |
| `APP_CORS_ALLOWED_ORIGINS=https://${aws_cloudfront_distribution.frontend.domain_name}` | `environment[]` block | The app's prod profile has no default for this and crashes on startup without a value. Was `*` during initial bring-up — now scoped to the live CloudFront domain. | Once we have a custom domain, replace with that and add a localhost entry for dev if needed. |

(Note: the user message described the CORS override as still `*` — that was the original Step-13 value. After Step 14 it's a dynamic reference to the CloudFront domain. The wildcard window has closed.)

**Cost while torn down**: the only ongoing AWS cost overnight is S3 storage for the Angular dist (~330 KB, fractions of a cent) and ECR storage for the Docker image (~260 MB, ~$0.026/mo prorated). Effectively zero. Teardown saves ~$3.30/day in interface VPC endpoints, RDS, ALB, and Fargate.

## Architecture Status

End-of-day snapshot of the `warehouse-manager` infra design. All resources are Terraform-managed, prefixed `warehouse-`, in `us-east-2` across two AZs (`us-east-2a`, `us-east-2b`). Specific resource IDs (RDS DNS suffix, secret ARN suffix, image digests, vpce IDs) are dynamic — they regenerate on each `terraform apply` and are not pinned here.

### Components Built
| Layer              | File                       | Resources                                                                                                                                       |
|--------------------|----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| Networking         | `vpc.tf`                   | VPC, IGW, 6 subnets (2× public, 2× private-app, 2× private-db), 3 route tables, `warehouse-db-subnet-group`                                     |
| VPC Endpoints      | `endpoints.tf`             | 1 Gateway (S3) + 4 Interface (ECR api, ECR dkr, CloudWatch Logs, Secrets Manager) — replaces NAT Gateway                                        |
| Security Groups    | `security.tf`+`endpoints.tf` | `warehouse-alb-sg`, `warehouse-ecs-sg`, `warehouse-rds-sg`, `warehouse-vpc-endpoints-sg` — chained by SG ID, zero CIDR ingress on private tiers |
| Data Layer         | `rds.tf`                   | `aws_db_instance.warehouse` (PG 16.13, `db.t4g.micro`, 20GB gp3, encrypted, no PI / no enhanced mon / no autoscale), `random_password.db`, `aws_secretsmanager_secret.db` (`warehouse/prod/db`) |
| Container Registry | `ecr.tf`                   | `warehouse-api` ECR repo (MUTABLE, scan-on-push); current image `:v1` is `linux/arm64`                                                          |
| ECS Foundation     | `ecs_base.tf`              | `warehouse-cluster` (Container Insights disabled), `warehouse-ecs-task-execution-role` (managed `AmazonECSTaskExecutionRolePolicy` + inline `warehouse-secretsmanager-access`), `/ecs/warehouse-api` log group (7-day retention) |
| Networking Entry   | `alb.tf`                   | `warehouse-alb` (internet-facing, both public subnets), `warehouse-api-tg` (HTTP/8080, target_type=ip, health `/actuator/health`), `warehouse-http-listener` (port 80 → forward TG) |
| ECS Task           | `ecs_task.tf`              | `aws_ecs_task_definition.warehouse_api` (family `warehouse-api`, FARGATE, `awsvpc`, 256 CPU / 512 MB, ARM64); single container `warehouse-api` from ECR `:v1`, env vars + Secrets-Manager-injected DB creds, awslogs → `/ecs/warehouse-api` |
| ECS Service        | `ecs_service.tf`           | `aws_ecs_service.warehouse_api` (`warehouse-api-service`, FARGATE, desired=1, private-app subnets only, `assign_public_ip=false`, `warehouse-ecs-sg`, registered with `warehouse-api-tg` on container port 8080, `health_check_grace_period_seconds=60`, `wait_for_steady_state=true`) — **LIVE & HEALTHY** at task definition revision 13: target group reports healthy, `/actuator/health` returns 200 `{"status":"UP","groups":["liveness","readiness"]}` |
| Frontend Hosting   | `frontend.tf`              | `warehouse-frontend-510490942892` private S3 bucket (Block Public Access on, no website hosting), `warehouse-frontend-oac` CloudFront OAC, CloudFront distribution at `d2nj1zjj63cakw.cloudfront.net` (HTTPS-redirect, SPA fallback for 403/404 → `/index.html`), bucket policy allowing OAC `s3:GetObject` only |
| Provider           | `provider.tf`              | `hashicorp/aws ~> 5.0`, `hashicorp/random ~> 3.6`; default tags `Project=warehouse-manager`, `ManagedBy=terraform`                              |

### Security Group Mesh (summary)
```
                0.0.0.0/0
                    │ 80/443
                    ▼
        ┌────────────────────┐
        │  warehouse-alb-sg  │
        └─────────┬──────────┘
                  │ 8080
                  ▼
        ┌────────────────────┐         5432         ┌────────────────────┐
        │  warehouse-ecs-sg  ├─────────────────────►│  warehouse-rds-sg  │──► RDS (private-db, 2 AZs)
        └─────────┬──────────┘                      └────────────────────┘
                  │ 443
                  ▼
   ┌────────────────────────────┐
   │ warehouse-vpc-endpoints-sg │──► ECR api/dkr · Logs · Secrets Manager
   └────────────────────────────┘
                  │
                  └─ S3 via Gateway Endpoint on private-app RT (no SG)
```
Ingress rules use `aws_security_group_rule` resources for the ALB↔ECS pair to break the reference cycle; the endpoints SG keeps inline rules. No SG accepts `0.0.0.0/0` except `warehouse-alb-sg`. Detailed table in §Security Group Mesh below.

### RDS (summary)
- `warehouse-postgres` — PostgreSQL 16.13, `db.t4g.micro`, 20GB gp3, **encrypted** (default AWS KMS), `publicly_accessible=false`, `skip_final_snapshot=true`.
- Lives in `warehouse-db-subnet-group` (both `private-db` subnets). Reachable only from `warehouse-ecs-sg` on `5432/tcp`.
- Master password generated by `random_password.db` (16 chars, RDS-safe special set, never in source).
- Credentials JSON (`host`, `port`, `dbname`, `username`, `password`) stored in Secrets Manager at `warehouse/prod/db`. Workloads should look it up by **name**, not ARN, since the ARN suffix is regenerated each apply.
- ECS reaches the secret via the Secrets Manager VPC endpoint — no NAT path needed.

### ECS Foundation (summary)
- **Cluster**: `warehouse-cluster` — Container Insights **disabled** for cost (no `aws/ecs/containerinsights/...` log streams).
- **Execution Role**: `warehouse-ecs-task-execution-role` — assumed by `ecs-tasks.amazonaws.com`. Carries the AWS-managed `AmazonECSTaskExecutionRolePolicy` (covers ECR pull + log group writes) plus an inline `warehouse-secretsmanager-access` policy granting `secretsmanager:GetSecretValue` scoped to the dynamic ARN of `aws_secretsmanager_secret.db` (`warehouse/prod/db`).
- **Log Group**: `/ecs/warehouse-api` — `retention_in_days = 7` to cap CloudWatch storage cost. Task definitions should target this group with the `awslogs` log driver.
- **Task Role** (separate from execution role): not yet created — the task itself currently needs no AWS API access. Add when the app starts calling AWS services directly.

### Networking Entry Point (summary)
- **Public DNS**: `warehouse-alb-381158838.us-east-2.elb.amazonaws.com` (ALB regenerates a new hostname on each rebuild — re-read after every `apply`).
- **Flow**: Client → ALB:80 (HTTP, public subnets, `warehouse-alb-sg`) → forward action → `warehouse-api-tg` → ECS task IP:8080 (private-app subnets, `warehouse-ecs-sg`).
- **Target group** is `target_type = "ip"` (required for Fargate awsvpc networking) with health check `GET /actuator/health` expecting HTTP 200. Targets stay empty until the ECS service registers them.
- **Single subnet tier**: ALB attaches only to `aws_subnet.public[*]` (the resources tagged `Tier = public`). Private subnets are never in `aws_lb.subnets`.

### ECS Task Definition (summary)
- **Family / Revision**: `warehouse-api` — current revision **12** (counter persists across `terraform destroy`/`apply` cycles since ECS keeps the family registered; revisions 8–11 are previous attempts).
- **Launch**: Fargate, `awsvpc`, 256 CPU / 512 MB, ARM64/Linux (matches the `:v1` image arch — wrong arch = task fails to launch).
- **Container**: single `warehouse-api` from `${aws_ecr_repository.warehouse_api.repository_url}:v1`, port 8080/tcp, `essential = true`.
- **Env (plaintext)**:
  - `SPRING_PROFILES_ACTIVE=prod`, `DB_HOST=<RDS address>`, `DB_PORT=5432`, `DB_NAME=warehouse` (DB connection params).
  - `SPRING_JPA_HIBERNATE_DDL_AUTO=update` (overrides the `validate` setting hardcoded in `application-prod.properties` — see Technical Debt below).
  - `APP_CORS_ALLOWED_ORIGINS=*` (wide-open for testing — tighten before treating this as a real prod env).
- **Secrets (injected)**: `DB_USER` (← `username` key), `DB_PASSWORD` (← `password` key), `JWT_SECRET` (← `jwt` key) pulled from JSON keys of `aws_secretsmanager_secret.db` via `valueFrom = "<arn>:<key>::"`. The execution role's inline `warehouse-secretsmanager-access` policy authorizes this lookup.
- **Logs**: `awslogs` driver → `/ecs/warehouse-api`, `awslogs-region = data.aws_region.current.name`, stream prefix `ecs`.
- **Task Role**: not set — the running container makes no AWS API calls today. Add when the app calls S3/SQS/etc.

### ECS Service (summary)
- **Service**: `warehouse-api-service` in `warehouse-cluster` — FARGATE, desired=1, healthy on revision 12.
- **Network**: tasks attach to `aws_subnet.private_app[*]` only, `assign_public_ip = false`, single SG `warehouse-ecs-sg`.
- **LB integration**: registers task ENI IPs into `warehouse-api-tg` on container port 8080. ALB on port 80 forwards to the TG.
- **Health-check grace period**: 60s (Spring Boot warm starts well within that — currently passing health checks ~30-60s after task launch).
- **Apply behavior**: `wait_for_steady_state = true`, so `terraform apply` blocks until the new revision is steady. If you destroy this service, untaint after a wait-failure rather than recreate.

### Live Endpoint
- **Backend (ALB)**: `http://warehouse-alb-381158838.us-east-2.elb.amazonaws.com`
- **Backend health probe**: `http://warehouse-alb-381158838.us-east-2.elb.amazonaws.com/actuator/health` → `200 {"status":"UP","groups":["liveness","readiness"]}`
- **Frontend (CloudFront)**: `https://d2nj1zjj63cakw.cloudfront.net` — serving Angular SPA from the synced `dist/warehouse-manager/browser/` build (last known: `index.html`, `main-7HPSAYPT.js`, `styles-5INURTSO.css`, `favicon.ico`).
- Both DNS names regenerate after full destroy/apply — re-read from `aws_lb.warehouse.dns_name` and `aws_cloudfront_distribution.frontend.domain_name` before sharing.

### Frontend Hosting (summary)
- **S3 bucket** `warehouse-frontend-510490942892`: private, all four Block Public Access flags on, `BucketOwnerEnforced` ownership (no ACLs). Static-website-hosting is intentionally **off** — CloudFront talks to the S3 REST API (`bucket_regional_domain_name`), not the website endpoint, which is what OAC requires.
- **CloudFront OAC** `warehouse-frontend-oac`: sigv4, signing always, S3 origin type. Replaces the legacy OAI pattern.
- **CloudFront distribution**: domain `d2nj1zjj63cakw.cloudfront.net`, default-root-object `index.html`, viewer policy **`allow-all`** (temporarily — see Tech Debt; was `redirect-to-https` until the Mixed Content workaround), price class `PriceClass_100` (cheapest — US/EU edges). Cache policy = AWS-managed `Managed-CachingOptimized` (looked up via `data.aws_cloudfront_cache_policy`).
- **SPA fallback**: custom error responses map both **403** and **404** → `/index.html` with HTTP **200**, `error_caching_min_ttl=0`. This is what makes Angular routing work for deep links — any URL the user navigates to that doesn't have a corresponding S3 object falls back to the SPA shell.
- **Bucket policy**: only `s3:GetObject`, only for the `cloudfront.amazonaws.com` service principal, only when `AWS:SourceArn` matches our distribution. The bucket is unreachable from anywhere except this CloudFront distribution.
- **CORS link**: ECS task definition revision 13 sets `APP_CORS_ALLOWED_ORIGINS=https://${aws_cloudfront_distribution.frontend.domain_name}` so the Spring Boot backend only accepts cross-origin requests from this exact distribution. (Previous wildcard `*` is gone — see Technical Debt resolution below.)

### Not Yet Built
- Route53 / ACM cert / HTTPS listener on the ALB (port 80 listener is HTTP-only for now).
- Schema migration tool (Flyway/Liquibase) — see Technical Debt.

### Technical Debt / Open Items
- **`SPRING_JPA_HIBERNATE_DDL_AUTO=update` is an active override.** `application-prod.properties` deliberately sets `spring.jpa.hibernate.ddl-auto=validate` — we're bypassing that at the infra layer (env var) so Hibernate auto-creates the schema on a fresh empty DB. This is fine for the current dev/demo posture but **must be replaced with a real migration tool (Flyway or Liquibase) before this becomes anything resembling production**. With `update`, Hibernate will silently add columns and tables on each app deploy, never drops or renames safely, and offers no migration history. Concrete next steps: (a) add Flyway/Liquibase to the Spring Boot dependencies; (b) author baseline + future migrations under `src/main/resources/db/migration/`; (c) remove the `SPRING_JPA_HIBERNATE_DDL_AUTO=update` env var from `ecs_task.tf`; (d) restore the `validate` setting in `application-prod.properties` (or leave it — the migrations will keep schema in sync).
- ~~**`APP_CORS_ALLOWED_ORIGINS=*` is wide open.**~~ **Resolved.** Now scoped to the CloudFront origin (`https://${aws_cloudfront_distribution.frontend.domain_name}`) in `ecs_task.tf`. If you need to add a localhost dev origin or a future apex domain, append them as a comma-separated list — Spring's `app.cors.allowed-origins` reads it as CSV.
- **End-to-end is HTTP-only.** ALB has only a port-80 listener (no TLS, no ACM cert, no Route53 record). To dodge browser Mixed Content blocking when the SPA calls the API, the CloudFront distribution's `viewer_protocol_policy` is set to `allow-all` (was `redirect-to-https`) so users hit the frontend over plain HTTP and the in-page fetch to the ALB also goes over HTTP. **Pre-prod migration plan**: (1) register a custom domain in Route53, (2) request an ACM cert in `us-east-1` for CloudFront and another in `us-east-2` for the ALB, (3) add a 443 HTTPS listener on the ALB forwarding to `warehouse-api-tg`, (4) attach the ACM cert to CloudFront with `aliases = [<domain>]`, (5) flip `viewer_protocol_policy` back to `redirect-to-https`, (6) update the SPA's API base URL to the HTTPS ALB hostname (or a CloudFront behavior that proxies `/api/*` to the ALB origin). Until all of those land, do not expose the site to real users — credentials and JWT tokens are flowing over plaintext.
- **JWT secret rotation.** `random_bytes.jwt.base64` is generated at first apply and persisted in the secret. Rotation requires `terraform taint random_bytes.jwt && terraform apply`, which will: (a) regenerate the value, (b) write a new secret_version, (c) force a new task definition revision, (d) roll the service. All existing JWTs become invalid on rotation — confirm that's desired before doing it.
- **Schema is empty until first start.** With `ddl-auto=update`, Hibernate creates tables on first task launch. If RDS is rebuilt while the service is up, the running task keeps the old (now-broken) connection — the new (empty) DB won't have tables. Restart the service after any RDS rebuild.

### Cost Floor (approx., monthly, us-east-2)
| Item                                              | Cost     |
|---------------------------------------------------|----------|
| 4× Interface VPC Endpoints (×2 AZs, ~$7.30 each)  | ~$58     |
| RDS `db.t4g.micro` + 20GB gp3 + free backup tier  | ~$15     |
| Secrets Manager (1 secret)                        | ~$0.40   |
| ECR storage (~260 MB)                             | ~$0.03   |
| ECS cluster (Container Insights disabled)         | $0       |
| CloudWatch Logs `/ecs/warehouse-api` (7-day, idle)| ~$0      |
| ALB (`warehouse-alb`, 1 LCU baseline, idle)       | ~$17     |
| Fargate task (1× 256 CPU / 512 MB ARM64, 24/7)    | ~$9      |
| S3 frontend bucket (Angular dist, low GB)         | ~$0      |
| CloudFront (1 distribution, low traffic)          | ~$0–2    |
| **Subtotal — current footprint**                  | **~$99–101** |

A NAT Gateway alternative would be ~$32/mo + data charges. The current setup pays ~$26 extra for the no-internet-egress posture. Trade-off is intentional per §Non-Negotiables.

## Technical Specs (Source of Truth)

### Region & Provider
- Region: `us-east-2`
- AWS CLI profile: `admin`
- Terraform AWS provider: `~> 5.0`
- Default tags applied to every resource: `Project = warehouse-manager`, `ManagedBy = terraform`

### Naming Convention
- Every AWS resource name is prefixed with `warehouse-`.
- Examples: `warehouse-vpc`, `warehouse-igw`, `warehouse-public-rt`, `warehouse-private-app-rt`, `warehouse-private-db-rt`, `warehouse-db-subnet-group`, `warehouse-vpc-endpoints-sg`, `warehouse-s3-endpoint`, `warehouse-ecr-api-endpoint`, `warehouse-ecr-dkr-endpoint`, `warehouse-logs-endpoint`, `warehouse-secretsmanager-endpoint`.
- Subnet `Name` tags include the AZ suffix: `warehouse-<tier>-<az>` (e.g., `warehouse-private-app-us-east-2a`).
- Subnets also carry a `Tier` tag: `public`, `private-app`, or `private-db`.

### VPC & 6-Subnet Layout
- VPC CIDR: `10.0.0.0/16`
- DNS: `enable_dns_support = true`, `enable_dns_hostnames = true` (required for interface endpoint private DNS)
- Two AZs: the first two returned by `aws_availability_zones` (currently `us-east-2a`, `us-east-2b`)

| Tier        | AZ-a CIDR        | AZ-b CIDR        | Route Table              | Internet Route |
|-------------|------------------|------------------|--------------------------|----------------|
| public      | `10.0.1.0/24`    | `10.0.2.0/24`    | `warehouse-public-rt`    | `0.0.0.0/0` → IGW |
| private-app | `10.0.11.0/24`   | `10.0.12.0/24`   | `warehouse-private-app-rt` | none |
| private-db  | `10.0.21.0/24`   | `10.0.22.0/24`   | `warehouse-private-db-rt`  | none |

- Public subnets set `map_public_ip_on_launch = true`.
- App and DB tiers each have their own route table with **no `0.0.0.0/0` route** — fully isolated, no NAT path.

### RDS
- `aws_db_subnet_group` named `warehouse-db-subnet-group` spans both `private-db` subnets.
- Future RDS instances MUST live in the DB tier only.

### Data Layer
- **RDS instance**: `warehouse-postgres` — PostgreSQL 16.13 on `db.t4g.micro`, 20GB gp3, encrypted (default AWS KMS), `publicly_accessible = false`, `skip_final_snapshot = true`. Storage autoscaling, Performance Insights, and Enhanced Monitoring all disabled for cost.
- **Endpoint**: `warehouse-postgres.c78qsym8cd63.us-east-2.rds.amazonaws.com:5432`
- **Initial database**: `warehouse`
- **SG**: `warehouse-rds-sg` only — ingress 5432/tcp from `warehouse-ecs-sg` (no public access path).
- **Subnet group**: `warehouse-db-subnet-group` (both `private-db` subnets, AZ-a + AZ-b).
- **Master credentials**: generated by `random_password.db` (16 chars, RDS-safe special set). NEVER hardcoded in `.tf`. The full credential JSON in Secrets Manager carries six keys: `host`, `port`, `dbname`, `username`, `password`, and **`jwt`** (a 256-bit base64 string from `random_bytes.jwt`, used by the app for JWT signing — see ECS Task Definition).
- **Secret name**: `warehouse/prod/db`
- **Secret ARN**: `arn:aws:secretsmanager:us-east-2:510490942892:secret:warehouse/prod/db-tlUVsj`
- **Recovery window**: `0` days — secret can be force-deleted. Bump this for prod.
- **Workload access pattern**: ECS tasks read this secret via the `secretsmanager` VPC endpoint (`vpce-028325be86bf49351`); no internet path required.

### Deployment Artifacts
- **ECR repo**: `warehouse-api`
- **Repository URI**: `510490942892.dkr.ecr.us-east-2.amazonaws.com/warehouse-api`
- **ARN**: `arn:aws:ecr:us-east-2:510490942892:repository/warehouse-api`
- **Tag mutability**: `MUTABLE` (overwrites allowed — tighten to `IMMUTABLE` once we cut release tags)
- **Scan on push**: enabled (basic ECR scanning, free)

> **Image lifecycle gotcha**: ECR *images* live outside Terraform state. `terraform destroy` removes the repo (and with it every image inside). After a fresh `terraform apply` from zero, the repo is **empty** until a `docker push` runs. Any ECS service or task definition pointing at `:v1` will fail with `CannotPullContainerError ... not found` until the image is re-pushed. Always verify with `aws ecr list-images --repository-name warehouse-api` before launching ECS workloads. Long-term fix options: split ECR into a separate Terraform stack so it survives data-layer rebuilds, or automate the docker push as part of the rebuild flow.

| Tag  | Image URI                                                                  | Arch      | Index Digest                                                              |
|------|----------------------------------------------------------------------------|-----------|---------------------------------------------------------------------------|
| `v1` | `510490942892.dkr.ecr.us-east-2.amazonaws.com/warehouse-api:v1`            | linux/arm64 | (re-pushed each rebuild — digest changes per build) |

- **Architecture**: `linux/arm64` — built natively on Apple Silicon. The ECS task definition MUST set `runtime_platform { cpu_architecture = "ARM64", operating_system_family = "LINUX" }`. Default Fargate is `X86_64` and would fail to launch this image.
- **Source path**: `../server/warehouse-api/` (Spring Boot, multi-stage Dockerfile, `eclipse-temurin:21-jdk-jammy`, `EXPOSE 8080`).
- **Push flow** (for future tags):
  ```
  aws ecr get-login-password --region us-east-2 --profile admin \
    | docker login --username AWS --password-stdin 510490942892.dkr.ecr.us-east-2.amazonaws.com
  docker build -t warehouse-api:<tag> server/warehouse-api
  docker tag warehouse-api:<tag> 510490942892.dkr.ecr.us-east-2.amazonaws.com/warehouse-api:<tag>
  docker push 510490942892.dkr.ecr.us-east-2.amazonaws.com/warehouse-api:<tag>
  ```
- ECS pulls images via the `ecr.api` + `ecr.dkr` VPC endpoints (no NAT). Image layers come from S3 via the S3 Gateway Endpoint.

### ECS Foundation
- **Cluster**
  - Name: `warehouse-cluster`
  - ARN: `arn:aws:ecs:us-east-2:510490942892:cluster/warehouse-cluster`
  - Container Insights: **disabled** (cost: avoids per-metric and CW Logs charges from CI streams). Re-enable per-cluster only if we need the dashboards.
- **Task Execution Role**
  - Name: `warehouse-ecs-task-execution-role`
  - ARN: `arn:aws:iam::510490942892:role/warehouse-ecs-task-execution-role`
  - Trust: `ecs-tasks.amazonaws.com` (Service principal, `sts:AssumeRole`).
  - Attached managed policy: `arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy` (covers ECR pull + writing to CloudWatch Logs).
  - Inline policy `warehouse-secretsmanager-access`: `secretsmanager:GetSecretValue` on `aws_secretsmanager_secret.db.arn` only — scoped to the `warehouse/prod/db` secret. ARN suffix is dynamic, so it is referenced via the resource attribute, never hardcoded.
- **Log Group**
  - Name: `/ecs/warehouse-api`
  - Retention: **7 days** (cap CloudWatch Logs cost; raise only if compliance/forensics demand it).
  - Future task definitions ship logs here via the `awslogs` driver: `awslogs-group=/ecs/warehouse-api`, `awslogs-region=us-east-2`, `awslogs-stream-prefix=ecs`.
- **Not yet built**: a separate **task role** (the role assumed by the container itself, distinct from the execution role). Add when the application starts calling AWS APIs directly. The execution role above is *only* for the ECS agent's pull/log/secret-fetch operations.

### Networking Entry Point (ALB)
- **Load Balancer**
  - Name: `warehouse-alb`
  - Type: `application`, `internal = false` (internet-facing)
  - DNS Name: `warehouse-alb-381158838.us-east-2.elb.amazonaws.com` — **dynamic**, regenerates on each rebuild. Always re-read from `aws_lb.warehouse.dns_name` after `apply`; do not hardcode in app config.
  - ARN: `arn:aws:elasticloadbalancing:us-east-2:510490942892:loadbalancer/app/warehouse-alb/<dynamic-suffix>`
  - Subnets: `aws_subnet.public[*].id` (both public subnets, AZ-a + AZ-b). Never attach to private subnets.
  - Security group: `aws_security_group.alb` (`warehouse-alb-sg`) only — already permits 80/443 from `0.0.0.0/0` and 8080 egress to `warehouse-ecs-sg`.
- **Target Group**
  - Name: `warehouse-api-tg`
  - Protocol: HTTP, Port: 8080, `target_type = "ip"` (mandatory for Fargate awsvpc — the registered target is the task ENI's private IP, not an instance ID).
  - VPC: `aws_vpc.main.id`.
  - Health check: `GET /actuator/health`, protocol HTTP, matcher `200`. Spring Boot Actuator default — make sure the app's `management.endpoints.web.exposure.include` includes `health` or the ALB will mark targets unhealthy.
- **Listener**
  - `warehouse-http-listener`: port 80, protocol HTTP, default action `forward` to `warehouse-api-tg`.
  - HTTPS (443) listener intentionally not created until ACM cert + Route53 record exist.

#### Traffic Flow
```
Internet (0.0.0.0/0)
        │ TCP 80
        ▼
warehouse-alb (public subnets, warehouse-alb-sg)
        │ forward (default action)
        ▼
warehouse-api-tg (HTTP:8080, target_type=ip, health=/actuator/health → 200)
        │ TCP 8080 (ALB SG → ECS SG)
        ▼
ECS Fargate task ENI (private-app subnet, warehouse-ecs-sg)  ← not yet deployed
```

The ALB lives in public subnets so it has internet ingress; tasks live in private-app subnets and are reachable *only* from the ALB's SG on 8080. There is no direct internet path to the task.

### ECS Task Definition
- **Resource**: `aws_ecs_task_definition.warehouse_api` (file `ecs_task.tf`).
- **Family**: `warehouse-api`
- **Current Revision**: `13` (most recent ARN: `arn:aws:ecs:us-east-2:510490942892:task-definition/warehouse-api:13`). Revision auto-increments every time the task definition's content changes; ECS never reuses a revision number, even after `destroy`. Always reference the current task def via the resource attribute (`aws_ecs_task_definition.warehouse_api.arn`), not a hardcoded `:N` ARN — the service's `task_definition` argument should be `aws_ecs_task_definition.warehouse_api.arn` so service updates always pick up the latest revision.
- **Compatibility / Runtime**:
  - `requires_compatibilities = ["FARGATE"]`
  - `network_mode = "awsvpc"` (required by Fargate; gives the task its own ENI in a private-app subnet)
  - `runtime_platform { cpu_architecture = "ARM64", operating_system_family = "LINUX" }` — must match the ECR image arch
  - `cpu = "256"`, `memory = "512"` — smallest Fargate size; bump if Spring Boot startup OOMs
- **Roles**:
  - `execution_role_arn = aws_iam_role.ecs_task_execution.arn` (`warehouse-ecs-task-execution-role`) — pulls image, fetches secrets, writes logs.
  - `task_role_arn` not set — add only when container code calls AWS APIs (S3, SQS, DynamoDB, etc.).
- **Container** (`warehouse-api`):
  - Image: `${aws_ecr_repository.warehouse_api.repository_url}:v1`
  - Port: `containerPort=8080, hostPort=8080, protocol=tcp` (host==container is required by `awsvpc`)
  - `essential = true`
- **Environment Variables (plaintext)**:
  | Name                              | Source                                            | Notes |
  |-----------------------------------|---------------------------------------------------|-------|
  | `SPRING_PROFILES_ACTIVE`          | `"prod"` (literal)                                | Activates `application-prod.properties`. |
  | `DB_HOST`                         | `aws_db_instance.warehouse.address`               | Maps to `${DB_HOST}` in the prod profile. |
  | `DB_PORT`                         | `"5432"` (literal)                                | Maps to `${DB_PORT:5432}` (default would also work). |
  | `DB_NAME`                         | `aws_db_instance.warehouse.db_name` (`warehouse`) | Maps to `${DB_NAME}`. |
  | `SPRING_JPA_HIBERNATE_DDL_AUTO`   | `"update"` (literal)                              | Overrides the `validate` setting in `application-prod.properties` via Spring relaxed binding. **Tech-debt override** — replace with Flyway/Liquibase migrations. |
  | `APP_CORS_ALLOWED_ORIGINS`        | `"https://${aws_cloudfront_distribution.frontend.domain_name}"` | Scoped to the CloudFront distribution. CSV-extend if you need additional origins (localhost dev, future apex). |
- **Secrets (injected from Secrets Manager JSON)**:
  | Env Var       | `valueFrom`                                                  | Maps to (in app)             |
  |---------------|--------------------------------------------------------------|------------------------------|
  | `DB_USER`     | `"${aws_secretsmanager_secret.db.arn}:username::"`           | `spring.datasource.username` |
  | `DB_PASSWORD` | `"${aws_secretsmanager_secret.db.arn}:password::"`           | `spring.datasource.password` |
  | `JWT_SECRET`  | `"${aws_secretsmanager_secret.db.arn}:jwt::"`                | `app.security.jwt.secret`    |

  The `:<key>::` suffix tells ECS to read a single JSON key from the secret, using the default version stage (AWSCURRENT) and version ID. The two trailing colons are required.
- **Logging**:
  - `logDriver = "awslogs"`
  - `awslogs-group = aws_cloudwatch_log_group.warehouse_api.name` (`/ecs/warehouse-api`)
  - `awslogs-region = data.aws_region.current.name` (resolves to `us-east-2`)
  - `awslogs-stream-prefix = "ecs"` → streams appear as `ecs/warehouse-api/<task-id>`

### Sensitive Data Handling
- `db_password` and the Secrets Manager `secret_string` end up in `terraform.tfstate` in plaintext. State is gitignored at the repo root (`/terraform/*`) AND inside `terraform/.gitignore`.
- `*.tfvars` files are gitignored (only `example.tfvars` is committable).
- If we ever migrate to a remote backend, it MUST encrypt at rest (S3 + SSE-KMS) and have versioning enabled.

### VPC Endpoints (NAT Gateway Replacement)
Endpoints are mandatory — this is how private workloads reach AWS services without a NAT Gateway.

| Endpoint        | Type      | Service                                    | Attached To                                    |
|-----------------|-----------|--------------------------------------------|------------------------------------------------|
| S3              | Gateway   | `com.amazonaws.us-east-2.s3`               | private-app route table                        |
| ECR api         | Interface | `com.amazonaws.us-east-2.ecr.api`          | Both `private-app` subnets (private DNS on)    |
| ECR dkr         | Interface | `com.amazonaws.us-east-2.ecr.dkr`          | Both `private-app` subnets (private DNS on)    |
| CloudWatch Logs | Interface | `com.amazonaws.us-east-2.logs`             | Both `private-app` subnets (private DNS on)    |
| Secrets Manager | Interface | `com.amazonaws.us-east-2.secretsmanager`   | Both `private-app` subnets (private DNS on)    |

- Interface endpoints use `aws_security_group.vpc_endpoints` (`warehouse-vpc-endpoints-sg`) which allows 443/tcp **from `warehouse-ecs-sg` only** (no VPC-CIDR ingress).
- `private_dns_enabled = true` on both ECR endpoints so the standard regional hostnames resolve to endpoint ENIs.
- Gateway endpoints (S3) are free; interface endpoints are ~$7.30/mo per AZ per endpoint + data processing. Do NOT add new interface endpoints without weighing cost vs. a NAT Gateway tradeoff.

### Security Group Mesh
SG-only chaining — no CIDR-based ingress on private resources. All cross-tier traffic flows through SG references. Cross-group rules use `aws_security_group_rule` resources to break the ALB↔ECS reference cycle.

| SG                           | Inbound                                | Outbound                                |
|------------------------------|----------------------------------------|-----------------------------------------|
| `warehouse-alb-sg`           | 80/tcp, 443/tcp from `0.0.0.0/0`       | 8080/tcp → `warehouse-ecs-sg`           |
| `warehouse-ecs-sg`           | 8080/tcp from `warehouse-alb-sg`       | all (Fargate standard)                  |
| `warehouse-rds-sg`           | 5432/tcp from `warehouse-ecs-sg`       | none                                    |
| `warehouse-vpc-endpoints-sg` | 443/tcp from `warehouse-ecs-sg`        | all                                     |

Traffic Lanes:
- Internet → `alb-sg` (80/443) → `ecs-sg` (8080) → `rds-sg` (5432)
- `ecs-sg` → `vpc-endpoints-sg` (443) for ECR / Logs / Secrets Manager (no NAT path)
- `ecs-sg` → S3 via the Gateway Endpoint on the `private-app` route table (no SG involvement)

Rules:
- ALB is the only group with public-internet ingress. Nothing else accepts `0.0.0.0/0`.
- New tiers MUST be referenced by SG ID, not CIDR. If a workload needs to talk to RDS or VPC endpoints, give it an SG and add a rule sourcing from that SG.
- Inline `ingress`/`egress` blocks and `aws_security_group_rule` resources cannot be mixed on the same SG. The ALB/ECS/RDS groups are rule-resource based; `vpc-endpoints-sg` keeps inline rules.

### Non-Negotiables
- No NAT Gateways, ever. If a workload needs outbound internet to a non-AWS destination, raise it before adding infra.
- No `0.0.0.0/0` routes on the `private-app` or `private-db` route tables.
- New AWS service access from private subnets should be evaluated as a VPC endpoint first.
- All resources stay in `us-east-2` across the two AZs listed above.