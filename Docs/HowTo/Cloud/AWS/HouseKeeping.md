# Secret Management
## IAM Access Key
<details><summary>IAM Access Key Rotation</summary>

```shell
# Rotating IAM Access Key.
__SHELL=0 \
    __MIN_DAYS=3 \
    _AWS__SELF_PROV=1 \
    _AWS__RESET_PROFILE=0 \
    _AWS__PROFILE=saml \
   x_AWS__SES_TO=3600 \
    _AWS__AIM_USR_NAME=u-ieng--ocp-installer \
    _BW__NOTE_NAME='note.AWS--IAMuser--OCPinstaller' \
    BW_SESSION="${BW_SESSION:+$([ -f "${BW_SESSION}" ] && cat "${BW_SESSION}" || echo "${BW_SESSION}")}" \
    BW_SESSION="$((bw status | grep -q '"status":"unlocked"') && echo "${BW_SESSION}" || bw unlock --raw || bw login --raw)" \
    AWS_ACCOUNT_ID=624914081466 \
    AWS_CONFIG_FILE="${HOME}/.aws/config" \
    AWS_SHARED_CREDENTIALS_FILE="${HOME}/.aws/credentials" \
    bash -c "$(cat - 0<<'cmdEOF'
        [ -n "${BW_SESSION}" ] && bw sync || {
            echo 'You do NOT have an active and sync:ed BitWarden Session!!!' 1>&2
            exit 1
        }
        ((__SHELL)) && exec bash    # Do NOT forget to exit the interactive session!!!

        typeset e=
        typeset bwData="$(bw get item "${_BW__NOTE_NAME}")"

        [ -z "${bwData}" ] && {
            echo "You may NOT have access to BitWarden Note \`${_BW__NOTE_NAME}\`." 1>&2
            exit 1
        }
        eval "$(echo "${bwData}" | jq -r '.fields[] | select(.name == "metadata.keyDate") | .value')"
        e="$(($(date -u +%s) - $(date -d "${keyDate}" +%s) + (6*60*60)))"       # Allow 6 h earlier as threshold.
        ((e < (__MIN_DAYS*24*60*60))) && {
            echo "Do not need to update as the key is only $(
                python3 -c 'import sys, datetime; print(datetime.timedelta(seconds=int(sys.argv[1])).days)' "${e}"
            ) days old."
            exit 0
        }
        {
            {
                echo "${bwData}" | bw encode | bw edit item "$(echo "${bwData}" | jq -r '.id')" &> /dev/null
            } && bw sync 1> /dev/null && bwData="$(bw get item "${_BW__NOTE_NAME}")"
        } || {
            echo "You do NOT have R/W access to BitWarden Note \`${_BW__NOTE_NAME}\`." 1>&2
            exit 1
        }

        if ((_AWS__SELF_PROV)); then
            eval "$(echo "${bwData}" | jq -r '.notes')"
        else
            shopt -s expand_aliases
            ((_AWS__RESET_PROFILE)) && {
                # Clean up the AWS CLI profile.
                sed -i "/^\[profile ${_AWS__PROFILE}\]/,/^\[/ {/^\[profile ${_AWS__PROFILE}\]/{d;b};/^\[/"\!"d}" "${AWS_CONFIG_FILE}"
                sed -i "/^\[${_AWS__PROFILE}\]/,/^\[/ {/^\[${_AWS__PROFILE}\]/{d;b};/^\[/"\!"d}" "${AWS_SHARED_CREDENTIALS_FILE}"
            }
            klist -s || kinit
            aws-saml.py \
                --region "${AWS_REGION}" \
                --target-profile "${_AWS__PROFILE}" \
                --target-role "${AWS_ACCOUNT_ID}-${_AWS__ROLE_NAME_SFX:=admin}" \
                ${_AWS__SES_TO:+--session-duration "${_AWS__SES_TO}"}
            alias aws='\aws --profile "${_AWS__PROFILE}"'
        fi

        for e in $(
            aws iam list-access-keys --user-name "${_AWS__AIM_USR_NAME}" |
                jq -r '.AccessKeyMetadata[] | select(.AccessKeyId != "'"$(
                    eval "$(echo "${bwData}" | jq -r '.notes')"
                    typeset -px AWS_ACCESS_KEY_ID 2> /dev/null |
                        sed -E "s/^declare -x AWS_ACCESS_KEY_ID=(\\\$?'|\")(.*)('|\")/\2/"
                )"'") | .AccessKeyId'
        ); do aws iam delete-access-key --user-name "${_AWS__AIM_USR_NAME}" --access-key-id "${e}"; done
        echo "${bwData}" | jq \
            --arg n "$(
                eval "$(
                    aws iam create-access-key --user-name "${_AWS__AIM_USR_NAME}" |
                    jq -r '.AccessKey | "'"export AWS_ACCESS_KEY_ID='\\(.AccessKeyId)' AWS_SECRET_ACCESS_KEY='\\(.SecretAccessKey)'"'"'
                )"
                typeset -p AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
            )" \
            --arg f__m "$(
                typeset keyDate="$(date -u +"%Y-%m-%d %H:%M:%S %Z")"
                typeset -p keyDate
            )" '
                .notes=($n + "\n") |
                (.fields[] | select(.name == "metadata.keyDate")).value=$f__m
            ' | bw encode | bw edit item "$(echo "${bwData}" | jq -r '.id')" 1> /dev/null
cmdEOF
    )"; echo $?
```
</details>


# Resource Pruning
## IAM Roles
<details><summary>IAM Roles Clean Up</summary>

```shell
# Cleaning Up Stale IAM Roles.
__SHELL=0 \
    __DRY_RUN=1 \
    _BW__NOTE_NAME='note.AWS--IAMuser--OCPinstaller' \
    BW_SESSION="${BW_SESSION:+$([ -f "${BW_SESSION}" ] && cat "${BW_SESSION}" || echo "${BW_SESSION}")}" \
    BW_SESSION="$((bw status | grep -q '"status":"unlocked"') && echo "${BW_SESSION}" || bw unlock --raw || bw login --raw)" \
    AWS_REGION=us-east-1 \
    bash -ec "$(cat - 0<<'cmdEOF'
        [ -n "${BW_SESSION}" ] && bw sync || {
            echo 'You do NOT have an active and sync:ed BitWarden Session!!!'
            exit 1
        }
        ((__SHELL)) && exec bash    # Do NOT forget to exit the interactive session!!!

        typeset iamRoleName= ocpClsID= hdr= e=

        eval "$(
            bw get notes "${_BW__NOTE_NAME}" || {
                echo "You may NOT have access to BitWarden Note \`${_BW__NOTE_NAME}\`." 1>&2
                echo false
            }
        )"
        aws configure list
        aws sts get-caller-identity

        while read -r iamRoleName; do
            # Check the IAM Role Name Pattern: ...clsName...-...5charID...
            ocpClsID="$([[ "${iamRoleName}" =~ ^(.+-[a-z0-9]{5})-(master|worker)-role$ ]] && echo "${BASH_REMATCH[1]}")"
            [ -z "${ocpClsID}" ] && continue

            # Check the OCP Tag: kubernetes.io/cluster/${ocpClsID}
            [ "$(
                aws iam list-role-tags --role-name "${iamRoleName}" \
                    --output text --query "Tags[?(Key == 'kubernetes.io/cluster/${ocpClsID}')].[Value]"
            )" = owned ] || continue

            # Check Trusted Entity: ec2.amazonaws.com
            [ "$(
                aws iam get-role --role-name "${iamRoleName}" \
                    --output text \
                    --query "Role.AssumeRolePolicyDocument.Statement[?((Effect == 'Allow') && contains(Principal.Service, 'ec2.amazonaws.com'))]"
            )" = '' ] && continue

            # Check if there is any running EC2 resources belongs to the Cluster.
            {
                aws ec2 describe-instances \
                    --filters \
                        "Name=tag-key,Values=kubernetes.io/cluster/${ocpClsID}" \
                        "Name=tag-value,Values=owned" \
                        "Name=instance-state-name,Values=running" \
                    --output text \
                    --query 'Reservations[*].Instances[*].InstanceId' | grep -q .
            } && continue

            if ((__DRY_RUN)); then
                echo "${hdr:=$'List of stale IAM Roles:\n    '}${iamRoleName}"
                hdr='    '
            else
                # Find the IAM Instance Profiles the Role is attached to and remove from it.
                while read -r e; do
                    echo "Detaching IAM Role \`${iamRoleName}\` from IAM Instance Profile \`${e}\`."
                    aws iam remove-role-from-instance-profile --instance-profile-name "${e}" --role-name "${iamRoleName}" --no-cli-pager
                done 0< <(
                    aws iam list-instance-profiles \
                        --output text --query "InstanceProfiles[?contains(Roles[*].RoleName, '${iamRoleName}')].[InstanceProfileName]"
                )
                # Delete IAM Instance Profiles without any Roles.
                while read -r e; do
                    echo "Deleting empty IAM Instance Profile \`${e}\`."
                    aws iam delete-instance-profile --instance-profile-name "${e}" --no-cli-pager
                done 0< <(
                    aws iam list-instance-profiles \
                        --output text --query 'InstanceProfiles[?(length(Roles) == `0`)].[InstanceProfileName]'
                )

                # Detach all AIM Permission Policies.
                while read -r e; do
                    echo "Detaching IAM Permission Policies \`${e}\` from IAM Role \`${iamRoleName}\`."
                    aws iam detach-role-policy --role-name "${iamRoleName}" --policy-arn "${e}" --no-cli-pager
                done 0< <(
                    aws iam list-attached-role-policies --role-name "${iamRoleName}" \
                        --output text --query 'AttachedPolicies[*].[PolicyArn]'
                )

                # Delete all AIM Inline Permission Policies.
                while read -r e; do
                    echo "Deleting AIM Inline Permission Policies \`${e}\` from IAM Role \`${iamRoleName}\`."
                    aws iam delete-role-policy --role-name "${iamRoleName}" --policy-name "${e}" --no-cli-pager
                done 0< <(
                    aws iam list-role-policies --role-name "${iamRoleName}" \
                        --output text --query 'PolicyNames[*].[@]'
                )

                # Delete the AIM Role.
                echo "Deleting IAM Role \`${iamRoleName}\`."
                aws iam delete-role --role-name "${iamRoleName}" --no-cli-pager
            fi
        done 0< <(aws iam list-roles --output text --query 'Roles[*].[RoleName]')
cmdEOF
    )"; echo $?
```
</details>
