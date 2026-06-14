#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# OptionForge — provision the EC2 box from the CLI (run on YOUR machine).
#
# Prereqs (you do these once — they hold YOUR credentials, not me):
#   1. Install AWS CLI v2:  https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
#   2. Run:  aws configure        (paste your Access Key, Secret, default region)
#
# Then:  chmod +x deploy/aws-provision.sh && ./deploy/aws-provision.sh
#
# It creates a key pair, a security group (22 from your IP; 80/443 public),
# launches an Ubuntu 24.04 t3.small, attaches an Elastic IP, and prints the
# SSH command + the IP to put in your Hostinger A record.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ===== EDIT IF YOU LIKE ==============================================
REGION="${AWS_REGION:-ap-south-1}"     # ap-south-1 = Mumbai (good for India)
INSTANCE_TYPE="t3.small"
KEY_NAME="optionforge-key"
SG_NAME="optionforge-sg"
VOLUME_GB="30"
# ====================================================================

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
aws() { command aws --region "$REGION" "$@"; }

log "Account: $(command aws sts get-caller-identity --query Arn --output text)"

# ── Key pair (saved locally as ./KEY_NAME.pem) ───────────────────────
if aws ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1; then
  echo "Key pair $KEY_NAME already exists (using existing ./$KEY_NAME.pem)."
else
  log "Creating key pair $KEY_NAME"
  aws ec2 create-key-pair --key-name "$KEY_NAME" \
    --query 'KeyMaterial' --output text > "$KEY_NAME.pem"
  chmod 600 "$KEY_NAME.pem"
  echo "Saved private key to ./$KEY_NAME.pem — keep it safe."
fi

# ── Security group ───────────────────────────────────────────────────
MY_IP="$(curl -s https://checkip.amazonaws.com)/32"
if SG_ID="$(aws ec2 describe-security-groups --group-names "$SG_NAME" \
      --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)" && [[ "$SG_ID" != "None" ]]; then
  echo "Security group $SG_NAME exists ($SG_ID)."
else
  log "Creating security group $SG_NAME"
  SG_ID="$(aws ec2 create-security-group --group-name "$SG_NAME" \
    --description "OptionForge web" --query 'GroupId' --output text)"
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --ip-permissions \
    "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${MY_IP},Description=ssh}]" \
    "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]" \
    "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]"
fi

# ── Latest Ubuntu 24.04 AMI (Canonical, via SSM) ─────────────────────
AMI_ID="$(aws ssm get-parameters \
  --names /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query 'Parameters[0].Value' --output text)"
log "Ubuntu 24.04 AMI: $AMI_ID"

# ── Launch instance (skip if one is already tagged) ──────────────────
EXISTING="$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=optionforge" "Name=instance-state-name,Values=running,pending" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || echo None)"
if [[ "$EXISTING" != "None" && -n "$EXISTING" ]]; then
  INSTANCE_ID="$EXISTING"
  echo "Reusing running instance $INSTANCE_ID."
else
  log "Launching $INSTANCE_TYPE"
  INSTANCE_ID="$(aws ec2 run-instances \
    --image-id "$AMI_ID" --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" --security-group-ids "$SG_ID" \
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=${VOLUME_GB},VolumeType=gp3}" \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=optionforge}]' \
    --query 'Instances[0].InstanceId' --output text)"
  echo "Instance $INSTANCE_ID launching…"
  aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
fi

# ── Elastic IP ───────────────────────────────────────────────────────
log "Allocating + associating Elastic IP"
ALLOC_ID="$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)"
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" >/dev/null
EIP="$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" \
  --query 'Addresses[0].PublicIp' --output text)"

cat <<EOF

\033[1;32m──────────────────────────────────────────────────────────────\033[0m
✓ EC2 ready.

  Elastic IP : ${EIP}
  Instance   : ${INSTANCE_ID}
  SSH        : ssh -i ./${KEY_NAME}.pem ubuntu@${EIP}

NEXT:
  1. Hostinger → DNS → A record  app  →  ${EIP}
  2. Copy this project to the server, then run deploy/setup.sh on it.
\033[1;32m──────────────────────────────────────────────────────────────\033[0m
EOF
