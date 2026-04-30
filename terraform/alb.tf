resource "aws_lb" "warehouse" {
  name               = "warehouse-alb"
  load_balancer_type = "application"
  internal           = false

  security_groups = [aws_security_group.alb.id]
  subnets         = aws_subnet.public[*].id

  tags = {
    Name = "warehouse-alb"
  }
}

resource "aws_lb_target_group" "warehouse_api" {
  name        = "warehouse-api-tg"
  vpc_id      = aws_vpc.main.id
  protocol    = "HTTP"
  port        = 8080
  target_type = "ip"

  health_check {
    path     = "/actuator/health"
    protocol = "HTTP"
    matcher  = "200"
  }

  tags = {
    Name = "warehouse-api-tg"
  }
}

resource "aws_lb_listener" "warehouse_http" {
  load_balancer_arn = aws_lb.warehouse.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.warehouse_api.arn
  }

  tags = {
    Name = "warehouse-http-listener"
  }
}
