resource "aws_security_group" "alb" {
  name        = "warehouse-alb-sg"
  description = "Public ALB: 80/443 from internet, egress only to ECS tasks"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "warehouse-alb-sg"
  }
}

resource "aws_security_group_rule" "alb_ingress_http" {
  type              = "ingress"
  security_group_id = aws_security_group.alb.id
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTP from internet"
}

resource "aws_security_group_rule" "alb_ingress_https" {
  type              = "ingress"
  security_group_id = aws_security_group.alb.id
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS from internet"
}

resource "aws_security_group_rule" "alb_egress_to_ecs" {
  type                     = "egress"
  security_group_id        = aws_security_group.alb.id
  from_port                = 8080
  to_port                  = 8080
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs.id
  description              = "8080 to ECS tasks"
}

resource "aws_security_group" "ecs" {
  name        = "warehouse-ecs-sg"
  description = "ECS Fargate tasks: 8080 from ALB, all egress"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "warehouse-ecs-sg"
  }
}

resource "aws_security_group_rule" "ecs_ingress_from_alb" {
  type                     = "ingress"
  security_group_id        = aws_security_group.ecs.id
  from_port                = 8080
  to_port                  = 8080
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  description              = "8080 from ALB"
}

resource "aws_security_group_rule" "ecs_egress_all" {
  type              = "egress"
  security_group_id = aws_security_group.ecs.id
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "All egress (Fargate standard)"
}

resource "aws_security_group" "rds" {
  name        = "warehouse-rds-sg"
  description = "RDS Postgres: 5432 from ECS only"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "warehouse-rds-sg"
  }
}

resource "aws_security_group_rule" "rds_ingress_from_ecs" {
  type                     = "ingress"
  security_group_id        = aws_security_group.rds.id
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs.id
  description              = "5432 from ECS tasks"
}
