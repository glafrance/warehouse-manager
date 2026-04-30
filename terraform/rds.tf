resource "random_password" "db" {
  length      = 16
  special     = true
  min_lower   = 2
  min_upper   = 2
  min_numeric = 2
  min_special = 2

  # RDS Postgres disallows: '/', '"', '@', and spaces in master password.
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_instance" "warehouse" {
  identifier = "warehouse-postgres"

  engine         = "postgres"
  engine_version = "16.13"
  instance_class = "db.t4g.micro"

  allocated_storage     = 20
  max_allocated_storage = 0
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "warehouse"
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.warehouse.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  performance_insights_enabled = false
  monitoring_interval          = 0

  skip_final_snapshot = true

  tags = {
    Name = "warehouse-postgres"
  }
}

resource "aws_secretsmanager_secret" "db" {
  name                    = "warehouse/prod/db"
  description             = "RDS Postgres master credentials for warehouse-postgres"
  recovery_window_in_days = 0

  tags = {
    Name = "warehouse-prod-db-secret"
  }
}

resource "random_bytes" "jwt" {
  length = 32
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    host     = aws_db_instance.warehouse.address
    port     = aws_db_instance.warehouse.port
    dbname   = aws_db_instance.warehouse.db_name
    username = var.db_username
    password = random_password.db.result
    jwt      = random_bytes.jwt.base64
  })
}
