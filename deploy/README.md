# Deploy to AWS EC2 (cheapest, ~7 days)

One `t4g.micro` instance (ARM, 1 GB) runs the whole stack with Docker Compose: PostgreSQL + backend + nginx/Angular on port 80. Estimated cost for 7 days: about $2-3 (instance ~$1.4, public IPv4 ~$0.85, 8 GB disk ~$0.15). Prices vary by region, so check the EC2 pricing page.

## 0. Push the deploy files to GitHub first

The instance clones the repo at boot, so `docker-compose.prod.yml` and `deploy/` must be on `master`:

```bash
git add docker-compose.prod.yml deploy
git commit -m "Add AWS EC2 deployment files"
git push
```

## 1. Launch the instance (AWS Console -> EC2 -> Launch instance)

| Setting | Value |
|---|---|
| Name | `drone-telemetry` |
| AMI | **Amazon Linux 2023**, architecture **64-bit (Arm)** |
| Instance type | **t4g.micro** |
| Key pair | Optional ("Proceed without a key pair" is fine; use *Get system log* to watch progress) |
| Network | Default VPC, **Auto-assign public IP: Enable** |
| Security group | Create new: allow **HTTP (80)** from `0.0.0.0/0`. Do **not** open 22 unless you need SSH, and then only from *My IP* |
| Storage | 8 GiB gp3 (default) |
| Advanced details -> User data | Paste the full contents of `deploy/ec2-user-data.sh` |

Launch it.

## 2. Open the app

Wait about 6-10 minutes (installing Docker and building images on a small instance is slow). Then open `http://<Public IPv4 address>` from the instance page.

Click **Run Pipeline** once to load the sample data.

Progress: EC2 -> select instance -> Actions -> Monitor and troubleshoot -> **Get system log**; the script ends with `DEPLOY DONE`.

## 3. Keep the cost low

- Do **not** stop and restart the instance: the public IP changes. Leave it running for the 7 days.
- After 7 days: Instance state -> **Terminate**. This also deletes the disk. Check that no Elastic IPs or volumes are left in the account.
- Safety net: Billing -> Budgets -> create a $5 budget with an email alert.

## Notes

- The backend is not exposed publicly; only nginx on port 80 is, and it proxies `/api/`. The `/docs` page is therefore not reachable from the internet.
- Traffic is plain HTTP (no certificate), fine for a short demo.
- The Postgres password is generated at first boot and stored in `/opt/drone-telemetry/.env` on the instance.
- To update the code later (EC2 Instance Connect or SSH): `cd /opt/drone-telemetry && git pull && docker compose -f docker-compose.prod.yml up -d --build`.
