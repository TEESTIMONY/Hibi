# AWS production deployment

**Current Hibi deployment:** one Ubuntu Lightsail server in Paris (`eu-west-3`), static IPv4 `35.181.96.164`, running Django, Nginx, and local PostgreSQL on the $7 server plan. This replaces the original ECS/RDS proposal below to fit the $10 budget. Do not provision the ECS/RDS design below for this budget. For the active server's notification rollout, follow [NOTIFICATIONS.md](NOTIFICATIONS.md). Secrets and `config/production.py` were created privately on the server and must be preserved during updates.

Status: source prepared only. No AWS resources, roles, databases, or deployments have been created. This computer currently has no AWS CLI or Docker installation. An AWS account alone does not give this chat access to that account.

## Proposed services

Use ECS Express Mode (Fargate) for Django, RDS PostgreSQL for the database, ECR for images, Secrets Manager for credentials, and CloudWatch for logs. Keep the frontend on Vercel. ECS Express provides a managed HTTPS endpoint and load balancer. A custom API domain is optional initially. AWS App Runner is closed to new customers as of April 30, 2026, so this setup targets ECS instead.

Region, monthly budget, account access, and resource sizing must be confirmed before provisioning. There are recurring charges for the container tasks, load balancer, RDS, secrets, logs, and possibly NAT gateways and data transfer. This is not a free hosting configuration.

## 1. Secure account access

Use AWS IAM Identity Center/SSO or sign in to your AWS console yourself. Never paste access keys, passwords, or OpenAI keys into chat. With a locally installed AWS CLI v2, use your configured SSO profile and `aws sso login --profile YOUR_PROFILE`. Confirm the intended account and region with `aws sts get-caller-identity --profile YOUR_PROFILE`. Use a budget alert before creating paid infrastructure.

The application needs a task execution role and an ECS Express infrastructure role. The execution role trusts ecs-tasks.amazonaws.com and uses AmazonECSTaskExecutionRolePolicy, plus secretsmanager:GetSecretValue scoped only to the three Hibi secret ARNs. If using a customer-managed KMS key, allow kms:Decrypt only for that key. The infrastructure role trusts ecs.amazonaws.com and uses the AWS-managed service-role/AmazonECSInfrastructureRoleforExpressGatewayServices policy. The deploying identity needs scoped iam:PassRole. Hibi itself does not need a general AWS access key or broad administrative task role.

## 2. Network and database

Create/use a VPC spanning at least two Availability Zones. Put RDS in private DB subnets, with Publicly accessible disabled, encryption enabled, backups and deletion protection enabled. Allow TCP 5432 only from the application's security group. Configure the application subnets to reach RDS privately and reach OpenAI over HTTPS; private application subnets need NAT egress (AWS endpoints alone do not provide OpenAI access). Do not use an unrestricted public database as an egress workaround.

Use PostgreSQL 16 or another Django-supported RDS version. Create the hibi database and a dedicated hibi_app role through a controlled database administration connection. Grant the app role ownership/schema privileges necessary for migrations only in this database; do not run Django using the RDS master role. Enable automated backups and test restoration. Store a URL-encoded connection URL in Secrets Manager:

postgresql://hibi_app:URL_ENCODED_PASSWORD@RDS_ENDPOINT:5432/hibi?sslmode=verify-full&sslrootcert=/app/certs/global-bundle.pem

The image downloads AWS's public RDS CA bundle during build. All database traffic in production must use TLS; the sample uses certificate and hostname validation. Refresh the image when AWS rotates its trust bundle.

## 3. Secrets and image

Create three Secrets Manager secrets containing the plain value of DJANGO_SECRET_KEY, DATABASE_URL, and OPENAI_API_KEY. Generate a fresh Django secret of at least 50 random characters. Do not reuse the local database, development secret, or test credentials. ECS injects these values at task startup; secret rotation requires a new deployment. Never pass secret values as Docker build arguments.

Build from the backend directory context (not the repository root):

```sh
docker build --platform linux/amd64 -t hibi-api:COMMIT_SHA backend
```

Create an ECR repository named hibi-api with tag immutability and image scanning enabled. Authenticate Docker to that registry, tag the image with the exact commit SHA, and push it. The context excludes local .env files, SQLite databases, virtual environments, caches, and tests. GitHub Actions includes PostgreSQL endpoint tests and an image build; that workflow does not deploy or receive production secrets.

## 4. Reviewable service request

Copy deploy/aws/config.example.json to deploy/aws/config.local.json. Enter identifiers and ARNs only, never secret values. Use application subnets in the RDS VPC and the application security group. For the initial apiHost, use a temporary explicit placeholder you control; health checks work without a finalized API hostname. After ECS assigns its HTTPS endpoint, replace apiHost with that exact hostname (or the final custom domain), regenerate configuration, and update the service environment before enabling user traffic. Do not use a wildcard host.

```sh
node scripts/prepare-aws.js deploy/aws/config.local.json
```

This produces deploy/aws/service.generated.json for review. Neither the script nor CI creates AWS resources. The generated request uses port 8000, /api/health, 0.5 vCPU, and 1 GB memory as an initial size to review against budget and load. Configure the actual scaling minimum/maximum and autoscaling settings explicitly in ECS before production traffic; do not rely on unknown service defaults.

After approval and account/region verification, deploy using the current AWS CLI ECS create-express-gateway-service command with the generated file, or enter the same configuration through the ECS Express console. Review inbound security groups to ensure only the managed load balancer can reach the application port. Trust X-Forwarded-Proto only when the proxy overwrites it and direct container ingress is blocked.

## 5. Release and database migration

The web container deliberately does not run migrations on every startup. Use a one-off ECS task with the same image, execution role, secrets, and network, overriding its command to `python manage.py migrate --noinput`. In the ECS console, use the service's generated task definition and Run new task; review container overrides and wait for exit code 0 before sending traffic. Run `python manage.py check --deploy` as another one-off task. The liveness endpoint checks the process, not database connectivity or migration state.

For a first empty deployment, keep the Vercel frontend disconnected until these steps finish. For later releases, use backward-compatible migrations before updating web tasks, monitor the rollout, and retain the previous immutable image for rollback. Database rollback requires its own migration/backup plan; rolling back an image does not roll back database data.

Local SQLite account data is not migrated automatically. If local data must be carried over, arrange a separate reviewed export/import. Do not upload db.sqlite3 or dump tokens/credentials into the source package.

## 6. Vercel and release verification

Set the Vercel build variable HIBI_API_BASE_URL to the final HTTPS API origin and redeploy the UI. No OpenAI key belongs in Vercel. Django's HIBI_FRONTEND_ORIGINS must exactly include https://hibi-dusky.vercel.app (plus any actual custom frontend origin); previews are not allowed automatically.

Check health, registration/sign-in, workspace save/reload, CORS preflight, admin static assets, and a real AI plan after approval of API usage. Test from an iPhone using the hosted HTTPS frontend. Verify logs contain no credentials, enable alarms, configure a shared cache for distributed rate limiting before scaling beyond the initial deployment, and record the budget and backup policy. AI is currently labeled Premium only; billing and premium access enforcement are not implemented.

## Checks completed locally versus pending

Local Django, settings, endpoint, and frontend tests can be run without AWS. Docker image build and real PostgreSQL CI remain pending until the workflow runs or Docker is available. The AWS service request is syntactically prepared but cannot be validated against your account, IAM permissions, network, quotas, or service versions until access is available.

Sources:
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html
- https://docs.aws.amazon.com/cli/latest/reference/ecs/create-express-gateway-service.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/networking-outbound.html
- https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html
- https://whitenoise.readthedocs.io/en/stable/django.html
