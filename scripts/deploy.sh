#!/bin/bash

# Petra AI Deployment Script
# This script handles deployment to various environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="development"
SKIP_TESTS=false
SKIP_BUILD=false
BACKUP_DB=true

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment    Environment to deploy to (development|staging|production)"
    echo "  -s, --skip-tests     Skip running tests"
    echo "  -b, --skip-build     Skip building Docker images"
    echo "  -n, --no-backup      Skip database backup (production only)"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e production"
    echo "  $0 --environment staging --skip-tests"
    echo "  $0 -e development -s -b"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -s|--skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        -b|--skip-build)
            SKIP_BUILD=true
            shift
            ;;
        -n|--no-backup)
            BACKUP_DB=false
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT"
    print_error "Must be one of: development, staging, production"
    exit 1
fi

print_status "Starting deployment to $ENVIRONMENT environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if required files exist
REQUIRED_FILES=(
    "docker/docker-compose.${ENVIRONMENT}.yml"
    "docker/.env.${ENVIRONMENT}"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        print_error "Required file not found: $file"
        exit 1
    fi
done

# Function to run tests
run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        print_warning "Skipping tests as requested"
        return 0
    fi

    print_status "Running tests..."
    
    # Backend tests
    print_status "Running backend tests..."
    cd packages/backend
    npm test
    cd ../..
    
    # Web frontend tests
    print_status "Running web frontend tests..."
    cd packages/web
    npm test
    cd ../..
    
    # Shared package tests
    print_status "Running shared package tests..."
    cd packages/shared
    npm test
    cd ../..
    
    print_success "All tests passed!"
}

# Function to build Docker images
build_images() {
    if [[ "$SKIP_BUILD" == "true" ]]; then
        print_warning "Skipping Docker image build as requested"
        return 0
    fi

    print_status "Building Docker images..."
    
    # Build backend image
    print_status "Building backend image..."
    docker build -f docker/Dockerfile.backend -t petra-ai/backend:latest .
    
    # Build web frontend image
    print_status "Building web frontend image..."
    docker build -f docker/Dockerfile.web -t petra-ai/web:latest .
    
    print_success "Docker images built successfully!"
}

# Function to backup database (production only)
backup_database() {
    if [[ "$ENVIRONMENT" != "production" ]] || [[ "$BACKUP_DB" == "false" ]]; then
        return 0
    fi

    print_status "Creating database backup..."
    
    BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Create database backup
    docker-compose -f docker/docker-compose.prod.yml exec -T postgres \
        pg_dump -U $POSTGRES_USER -d $POSTGRES_DB > "$BACKUP_DIR/database_backup.sql"
    
    # Compress backup
    gzip "$BACKUP_DIR/database_backup.sql"
    
    print_success "Database backup created: $BACKUP_DIR/database_backup.sql.gz"
}

# Function to deploy services
deploy_services() {
    print_status "Deploying services..."
    
    # Set the compose file based on environment
    COMPOSE_FILE="docker/docker-compose.${ENVIRONMENT}.yml"
    
    if [[ "$ENVIRONMENT" == "development" ]]; then
        COMPOSE_FILE="docker/docker-compose.dev.yml"
    fi
    
    # Stop existing services
    print_status "Stopping existing services..."
    docker-compose -f "$COMPOSE_FILE" down --remove-orphans
    
    # Start services
    print_status "Starting services..."
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # Wait for services to be healthy
    print_status "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker-compose -f "$COMPOSE_FILE" ps | grep -q "unhealthy\|starting"; then
            print_status "Waiting for services... (attempt $attempt/$max_attempts)"
            sleep 10
            ((attempt++))
        else
            break
        fi
    done
    
    if [[ $attempt -gt $max_attempts ]]; then
        print_error "Services failed to start within expected time"
        docker-compose -f "$COMPOSE_FILE" logs
        exit 1
    fi
    
    print_success "Services deployed successfully!"
}

# Function to run database migrations
run_migrations() {
    print_status "Running database migrations..."
    
    if [[ "$ENVIRONMENT" == "development" ]]; then
        cd packages/backend
        npx prisma migrate dev
        cd ../..
    else
        docker-compose -f "docker/docker-compose.${ENVIRONMENT}.yml" exec backend \
            npx prisma migrate deploy
    fi
    
    print_success "Database migrations completed!"
}

# Function to verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Check if services are running
    local services=("backend" "web" "postgres" "redis")
    
    for service in "${services[@]}"; do
        if docker-compose -f "docker/docker-compose.${ENVIRONMENT}.yml" ps "$service" | grep -q "Up"; then
            print_success "$service is running"
        else
            print_error "$service is not running"
            return 1
        fi
    done
    
    # Health checks
    local health_endpoints=(
        "http://localhost:3001/health"
        "http://localhost:3000/api/health"
    )
    
    for endpoint in "${health_endpoints[@]}"; do
        if curl -f -s "$endpoint" > /dev/null; then
            print_success "Health check passed: $endpoint"
        else
            print_warning "Health check failed: $endpoint"
        fi
    done
    
    print_success "Deployment verification completed!"
}

# Function to show deployment summary
show_summary() {
    print_success "Deployment completed successfully!"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "Services:"
    docker-compose -f "docker/docker-compose.${ENVIRONMENT}.yml" ps
    echo ""
    
    if [[ "$ENVIRONMENT" == "development" ]]; then
        echo "Access URLs:"
        echo "  Web App: http://localhost:3000"
        echo "  API: http://localhost:3001"
        echo "  Database Admin: http://localhost:8080"
        echo "  Redis Admin: http://localhost:8081"
    elif [[ "$ENVIRONMENT" == "production" ]]; then
        echo "Access URLs:"
        echo "  Web App: https://petra-ai.com"
        echo "  API: https://api.petra-ai.com"
    fi
    
    echo ""
    echo "To view logs: docker-compose -f docker/docker-compose.${ENVIRONMENT}.yml logs -f"
    echo "To stop services: docker-compose -f docker/docker-compose.${ENVIRONMENT}.yml down"
}

# Main deployment flow
main() {
    print_status "Petra AI Deployment Script"
    print_status "Environment: $ENVIRONMENT"
    echo ""
    
    # Pre-deployment checks
    run_tests
    build_images
    backup_database
    
    # Deployment
    deploy_services
    run_migrations
    verify_deployment
    
    # Post-deployment
    show_summary
}

# Run main function
main
