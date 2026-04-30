resource "aws_ecs_service" "warehouse_api" {
  name            = "warehouse-api-service"
  cluster         = aws_ecs_cluster.warehouse.id
  task_definition = aws_ecs_task_definition.warehouse_api.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private_app[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.warehouse_api.arn
    container_name   = "warehouse-api"
    container_port   = 8080
  }

  health_check_grace_period_seconds = 60

  wait_for_steady_state = true

  depends_on = [aws_lb_listener.warehouse_http]

  tags = {
    Name = "warehouse-api-service"
  }
}
