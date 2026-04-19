#!/usr/bin/env bash
set -euo pipefail

AWS_REGION=us-east-2
AWS_ACCOUNT_ID=510490942892
ECR_REPOSITORY=warehouse-api
IMAGE_TAG=latest

aws ecr get-login-password --region "$AWS_REGION"   | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker build -t "$ECR_REPOSITORY:$IMAGE_TAG" .
docker tag "$ECR_REPOSITORY:$IMAGE_TAG" "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"
