---
title: Accessing using OpenID Connect
sidebar_label: OIDC
---

Headlamp supports OIDC for cluster users to effortlessly log in using a "Sign in" button.

![screenshot the login dialog for a cluster](./oidc_button.png)

To use OIDC, Headlamp needs to know how to configure it, so you have to provide the following OIDC-related arguments to Headlamp from your OIDC provider:

- the client ID: `-oidc-client-id` or env var `HEADLAMP_CONFIG_OIDC_CLIENT_ID`
- the client secret: `-oidc-client-secret` or env var `HEADLAMP_CONFIG_OIDC_CLIENT_SECRET`
- the issuer URL: `-oidc-idp-issuer-url` or env var `HEADLAMP_CONFIG_OIDC_IDP_ISSUER_URL`
- (optionally) the OpenId scopes: `-oidc-scopes` or env var `HEADLAMP_CONFIG_OIDC_SCOPES`

and you have to tell the OIDC provider about the callback URL, which in Headlamp it is your URL + the `/oidc-callback` path, e.g.:
`https://YOUR_URL/oidc-callback`.

### Scopes

Besides the mandatory _openid_ scope, Headlamp also requests the optional
_profile_ and _email_
[scopes](https://openid.net/specs/openid-connect-basic-1_0.html#Scopes).
Scopes can be overridden by using the `-oidc-scopes` option. Remember to
include the default ones if you need them when using that option.
For example, if you need to keep the default scopes and add Github's `repo`,
then add them all to the option:

`-oidc-scopes=profile,email,repo`

**Note:** Before Headlamp 0.3.0, a scope _groups_ was also included, as it's
used by Dex and other services, but since it's not part of the default spec,
it was removed in the mentioned version.

### Token Validation Overrides

In the event your OIDC Provider issues `access_tokens` from a different Issuer URL or clientID audience than its `id_tokens` (i.e. Azure Entra ID) you may have need of the following parameters to configure what is used in validation of tokens.

- `-oidc-validator-client-id=<clientID audience to validate in token>` or env var `HEADLAMP_CONFIG_OIDC_VALIDATOR_CLIENT_ID` which is the clientID headlamp should be verifying in the `aud` field of the token provided back from the OIDC provider.
- `-oidc-validator-idp-issuer-url=<issuerURL to use in validation>` or env var `HEADLAMP_CONFIG_OIDC_VALIDATOR_IDP_ISSUER_URL` which is the IssuerURL headlamp should be verifying in the `iss` field of the token provided back from the OIDC Provider

### Use Access Tokens instead of ID Tokens

Be default, headlamp leverages the `id_token` provided back from the OIDC Provider after authentication returned to the `/oidc-callback` endpoint. For some Identity Providers like Azure Entra ID, the `access_token` is what is used for authorization to Kubernetes clusters. To instruct headlamp to use the `access_token` instead of the `id_token`, the following flag can be used.

- `-oidc-use-access-token=true` or env var `HEADLAMP_CONFIG_OIDC_USE_ACCESS_TOKEN`

### Example: OIDC with Keycloak in Minikube

If you are interested in a comprehensive example of using OIDC and Headlamp,
you can check the
[tutorial on setting up OIDC with Keycloack in Minikube](./keycloak/).

### Example: OIDC with Entra ID in AKS

If you are interested in a comprehensive tutorial of using OIDC and Headlamp in AKS,
you can check the
[tutorial on setting up OIDC with Entra ID in AKS](./azure-entra-id/).

For quick reference if you are already familiar with setting up Entra ID,

- Add the callback URL (e.g. `https://YOUR_URL/oidc-callback`) to your Azure App Registration's `redirectURIs`
- Set `-oidc-client-id` to your Azure App Registration's clientID
- Set `-oidc-client-secret` to your Azure App Registration's clientSecret
- Set `-oidc-idp-issuer-url` to `https://login.microsoftonline.com/<Your Azure Directory (tenant) ID>/v2.0`
- Set `-oidc-scopes` to `6dae42f8-4368-4678-94ff-3960e28e3630/user.read openid email profile`
- Set `--oidc-validator-idp-issuer-url` to `https://sts.windows.net/<Your Directory (tenant) ID>/`
- Set `-oidc-validator-client-id` to `6dae42f8-4368-4678-94ff-3960e28e3630`
- Set `-oidc-use-access-token=true`


### Example: OIDC with Dex

If you are using Dex and want to configure Headlamp to use it for OIDC,
then you have to:

- Add the callback URL (e.g. `https://YOUR_URL/oidc-callback`) to Dex's `staticClient.redirectURIs`
- Set `-oidc-client-id` as Dex's `staticClient.id`
- Set `-oidc-client-secret` as Dex's `staticClient.secret`
- Set `-oidc-idp-issuer-url` as Dex's URL (same as in `--oidc-issuer-url` in the Kubernetes APIServer)
- Set `-oidc-scopes` if needed, e.g. `-oidc-scopes=profile,email,groups`

**Note** If you already have another static client configured for Kubernetes for the [apiserver's OIDC](https://kubernetes.io/docs/reference/access-authn-authz/authentication/#configuring-the-api-server) (OpenID Connect) configuration, use a **single static client ID** i.e `-oidc-client-id` for both Dex and Headlamp. Additionally, the **redirectURIs** need to be specified for each client.
