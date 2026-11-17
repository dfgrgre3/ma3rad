# Central Server Security Configuration

This document outlines the security measures implemented in the central server and how to configure them for production deployment.

## Rate Limiting

The central server implements rate limiting to protect against brute-force attacks on the login endpoint.

### Configuration

The following environment variables control rate limiting behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | 15 | Time window for counting failed login attempts |
| `LOGIN_RATE_LIMIT_IP_MAX` | 30 | Maximum failed attempts per IP address within the window |
| `LOGIN_RATE_LIMIT_USERNAME_MAX` | 10 | Maximum failed attempts per username within the window |
| `MFA_RATE_LIMIT_WINDOW_MINUTES` | 15 | Time window for counting failed MFA attempts |
| `MFA_RATE_LIMIT_MAX` | 5 | Maximum failed MFA attempts per user+IP within the window |

### Behavior

- **IP-based limiting**: Blocks login attempts from an IP after too many failures, regardless of username
- **Username-based limiting**: Blocks login attempts for a specific username after too many failures
- **MFA limiting**: Independent counter for MFA code failures, scoped to both username and IP
- **Account locking**: After 5 consecutive failed password attempts for a valid user, the account is locked for 15 minutes

## CORS Configuration

The server restricts Cross-Origin Resource Sharing to specific origins only.

### Configuration

Set `CORS_ALLOWED_ORIGINS` as a comma-separated list of allowed origins:

```bash
# Development
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Production
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

If not set, defaults to `http://localhost:5173,http://localhost:3000` for development.

## HTTPS Enforcement

### Development

In development, the server runs on HTTP directly (http://localhost:3001).

### Production

For production deployment:

1. **Use a Reverse Proxy**: Place the central server behind nginx, Apache, or a cloud load balancer
2. **Terminate TLS at the Proxy**: Configure HTTPS at the reverse proxy layer with valid SSL/TLS certificates
3. **Enable HTTPS Enforcement**: Set `REQUIRE_HTTPS=1` in the environment to reject non-HTTPS requests
4. **Configure Proxy Headers**: Ensure the reverse proxy sets the `X-Forwarded-Proto` header

#### Example nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name central-api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Example Apache Configuration

```apache
<VirtualHost *:443>
    ServerName central-api.example.com
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    ProxyPreserveHost On
    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

## Electron Client Configuration

Update the Electron client's `CENTRAL_API_URL` to use HTTPS in production:

```bash
CENTRAL_API_URL=https://central-api.example.com
```

The Electron client validates that the central API URL uses HTTPS (except for localhost).

## Additional Security Recommendations

1. **Firewall Rules**: Restrict access to the central server port (3001) to only the reverse proxy
2. **IP Whitelisting**: Consider IP whitelisting for administrative access
3. **Monitoring**: Monitor `platform_login_attempts` and `platform_audit_events` tables for suspicious activity
4. **Regular Updates**: Keep dependencies up to date, especially security-related packages
5. **Secrets Management**: Never commit `.env` files; use environment variables or a secrets manager
6. **Database Backups**: Regularly backup the SQLite database and store securely
7. **Audit Chain Verification**: Periodically verify the audit chain integrity using the verification endpoint
