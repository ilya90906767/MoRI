#!/bin/bash
# Let's Encrypt cert for nginx/apache.
# Usage: ./setup-ssl.sh yourdomain.com [www.yourdomain.com]

set -e

# Text colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if script is run as root
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root or with sudo privileges${NC}"
    exit 1
fi

# Check if domain is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: No domain specified!${NC}"
    echo -e "Usage: $0 yourdomain.com [www.yourdomain.com]"
    exit 1
fi

# Set variables
PRIMARY_DOMAIN=$1
ALL_DOMAINS=($@)
WEB_SERVER=""
EMAIL=""
CERTBOT_INSTALLED=false
CERT_PATH=""

# Detect OS
if [ -f /etc/debian_version ]; then
    OS="debian"
    echo -e "${BLUE}Detected Debian/Ubuntu system${NC}"
elif [ -f /etc/redhat-release ]; then
    OS="centos"
    echo -e "${BLUE}Detected CentOS/RHEL system${NC}"
elif [ -f /etc/arch-release ]; then
    OS="arch"
    echo -e "${BLUE}Detected Arch Linux system${NC}"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    echo -e "${BLUE}Detected macOS system${NC}"
else
    echo -e "${YELLOW}Warning: Could not detect OS, proceeding with generic installation${NC}"
    OS="generic"
fi

# Detect web server
if command -v nginx >/dev/null 2>&1; then
    WEB_SERVER="nginx"
    echo -e "${BLUE}Detected Nginx web server${NC}"
elif command -v apache2 >/dev/null 2>&1 || command -v httpd >/dev/null 2>&1; then
    WEB_SERVER="apache"
    echo -e "${BLUE}Detected Apache web server${NC}"
else
    echo -e "${YELLOW}No web server detected. You'll need to configure your web server manually.${NC}"
fi

# Function to install certbot
install_certbot() {
    echo -e "\n${GREEN}Installing certbot...${NC}"
    
    case $OS in
        debian)
            apt-get update
            apt-get install -y certbot python3-certbot-nginx python3-certbot-apache
            ;;
        centos)
            yum install -y epel-release
            yum install -y certbot python3-certbot-nginx python3-certbot-apache
            ;;
        arch)
            pacman -Sy --noconfirm certbot certbot-nginx certbot-apache
            ;;
        macos)
            if ! command -v brew >/dev/null 2>&1; then
                echo -e "${RED}Homebrew is required for macOS installations. Please install it first.${NC}"
                echo -e "Visit https://brew.sh/ for installation instructions."
                exit 1
            fi
            brew install certbot
            ;;
        *)
            echo -e "${YELLOW}Installing certbot using pip...${NC}"
            if command -v pip3 >/dev/null 2>&1; then
                pip3 install certbot certbot-nginx certbot-apache
            else
                echo -e "${RED}Error: pip3 not found. Please install Python and pip first.${NC}"
                exit 1
            fi
            ;;
    esac
    
    if command -v certbot >/dev/null 2>&1; then
        echo -e "${GREEN}Certbot installed successfully!${NC}"
        CERTBOT_INSTALLED=true
    else
        echo -e "${RED}Failed to install certbot.${NC}"
        exit 1
    fi
}

# Check if certbot is installed
if command -v certbot >/dev/null 2>&1; then
    echo -e "${GREEN}Certbot is already installed.${NC}"
    CERTBOT_INSTALLED=true
else
    echo -e "${YELLOW}Certbot is not installed.${NC}"
    install_certbot
fi

# Ask for email address
read -p "$(echo -e $BLUE"Enter your email address (for certificate renewal notifications): "$NC)" EMAIL
if [ -z "$EMAIL" ]; then
    echo -e "${YELLOW}No email provided. Let's Encrypt won't be able to send you expiration notices.${NC}"
    EMAIL_ARG="--register-unsafely-without-email"
else
    EMAIL_ARG="--email $EMAIL"
fi

# Function to check domain DNS configuration
check_domain() {
    echo -e "\n${GREEN}Checking DNS configuration for $1...${NC}"
    if command -v host >/dev/null 2>&1; then
        HOST_IP=$(host $1 | grep "has address" | head -1 | awk '{print $4}')
        if [ -z "$HOST_IP" ]; then
            echo -e "${RED}Warning: Could not resolve $1 to an IP address.${NC}"
            echo -e "${YELLOW}Make sure your DNS is configured correctly before continuing.${NC}"
            read -p "$(echo -e $BLUE"Continue anyway? (y/n): "$NC)" CONTINUE
            if [[ ! $CONTINUE =~ ^[Yy]$ ]]; then
                exit 1
            fi
        else
            echo -e "${GREEN}Domain $1 resolves to $HOST_IP${NC}"
        fi
    else
        echo -e "${YELLOW}Warning: 'host' command not found. Skipping DNS check.${NC}"
    fi
}

# Check domain DNS configuration for all domains
for domain in "${ALL_DOMAINS[@]}"; do
    check_domain $domain
done

# Get certificate
echo -e "\n${GREEN}Generating SSL certificate for ${ALL_DOMAINS[*]}...${NC}"

# Build domain arguments
DOMAIN_ARGS=""
for domain in "${ALL_DOMAINS[@]}"; do
    DOMAIN_ARGS="$DOMAIN_ARGS -d $domain"
done

# Generate certificate based on web server
if [ "$WEB_SERVER" == "nginx" ]; then
    echo -e "${BLUE}Using Nginx plugin for certificate installation...${NC}"
    certbot --nginx $EMAIL_ARG --agree-tos --non-interactive $DOMAIN_ARGS
    CERT_PATH="/etc/letsencrypt/live/$PRIMARY_DOMAIN"
elif [ "$WEB_SERVER" == "apache" ]; then
    echo -e "${BLUE}Using Apache plugin for certificate installation...${NC}"
    certbot --apache $EMAIL_ARG --agree-tos --non-interactive $DOMAIN_ARGS
    CERT_PATH="/etc/letsencrypt/live/$PRIMARY_DOMAIN"
else
    echo -e "${BLUE}Using standalone mode for certificate generation...${NC}"
    echo -e "${YELLOW}Note: This will temporarily use port 80. Make sure it's not in use.${NC}"
    read -p "$(echo -e $BLUE"Press Enter to continue or Ctrl+C to abort..."$NC)"
    certbot certonly --standalone $EMAIL_ARG --agree-tos --non-interactive $DOMAIN_ARGS
    CERT_PATH="/etc/letsencrypt/live/$PRIMARY_DOMAIN"
    
    echo -e "\n${YELLOW}Certificate generated but not installed in your web server.${NC}"
    echo -e "${YELLOW}You need to manually configure your web server using these files:${NC}"
    echo -e "Certificate: ${CERT_PATH}/fullchain.pem"
    echo -e "Private key: ${CERT_PATH}/privkey.pem"
fi

# Set up auto-renewal
echo -e "\n${GREEN}Setting up auto-renewal...${NC}"
if [ "$OS" == "debian" ] || [ "$OS" == "centos" ] || [ "$OS" == "arch" ]; then
    # Check if crontab exists
    if ! command -v crontab >/dev/null 2>&1; then
        case $OS in
            debian)
                apt-get install -y cron
                ;;
            centos)
                yum install -y cronie
                systemctl enable crond
                systemctl start crond
                ;;
            arch)
                pacman -Sy --noconfirm cronie
                systemctl enable cronie
                systemctl start cronie
                ;;
        esac
    fi
    
    # Add renewal cron job if it doesn't exist
    if ! crontab -l | grep -q "certbot renew"; then
        (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | crontab -
        echo -e "${GREEN}Added certbot renewal to crontab. Certificates will renew automatically.${NC}"
    else
        echo -e "${YELLOW}Certbot renewal already exists in crontab.${NC}"
    fi
elif [ "$OS" == "macos" ]; then
    echo -e "${YELLOW}For macOS, you should setup a LaunchAgent for renewal.${NC}"
    echo -e "Run the following command periodically (recommended: twice daily):"
    echo -e "sudo certbot renew --quiet"
else
    echo -e "${YELLOW}Auto-renewal setup varies by system. Please ensure certbot renew runs regularly.${NC}"
    echo -e "Recommended cron job: 0 3 * * * certbot renew --quiet"
fi

# Provide post-installation instructions
echo -e "\n${GREEN}SSL Certificate successfully set up for ${ALL_DOMAINS[*]}!${NC}"
echo -e "\n${BLUE}Certificate Information:${NC}"
echo -e "Certificate location: ${CERT_PATH}/fullchain.pem"
echo -e "Private key location: ${CERT_PATH}/privkey.pem"
echo -e "Certificate expiry: $(certbot certificates | grep "Expiry" | head -1 | awk '{print $3, $4, $5, $6, $7}')"

echo -e "\n${BLUE}Next Steps:${NC}"
if [ "$WEB_SERVER" == "" ]; then
    echo -e "1. Configure your web server to use the SSL certificates"
    echo -e "   For Nginx, add to your server block:"
    echo -e "   ssl_certificate ${CERT_PATH}/fullchain.pem;"
    echo -e "   ssl_certificate_key ${CERT_PATH}/privkey.pem;"
    
    echo -e "\n2. Set up a redirect from HTTP to HTTPS"
else
    echo -e "1. Verify your website is accessible via HTTPS: https://$PRIMARY_DOMAIN"
    echo -e "2. Consider setting up HSTS for better security"
fi

echo -e "\n${BLUE}Renewal Information:${NC}"
echo -e "Certificates will automatically renew if the renewal job is running correctly."
echo -e "You can test the renewal process with: certbot renew --dry-run"

echo -e "\n${GREEN}Done!${NC}"
exit 0 