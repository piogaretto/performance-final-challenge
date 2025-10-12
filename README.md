# Performance CI Demo - Complete Stack

This project demonstrates a complete containerized CI/CD and performance monitoring stack using Jenkins, JMeter, Prometheus, and Grafana. It's designed for educational purposes and provides a simple, reusable setup.

## Architecture Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Jenkins   │    │ Node.js App │    │ Prometheus  │    │   Grafana   │
│   (CI/CD)   │    │   (AUT*)    │    │ (Metrics)   │    │(Dashboard)  │
│             │    │             │    │             │    │             │
│   Port:     │    │   Port:     │    │   Port:     │    │   Port:     │
│   8080      │    │   3000      │    │   9090      │    │   3001      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
        │                  │                  │                  │
        └──────────────────┼──────────────────┼──────────────────┘
                           │                  │
                    ┌─────────────┐    ┌─────────────┐
                    │   JMeter    │    │   Network   │
                    │(Load Tests) │    │jenkins_net  │
                    │             │    │             │
                    │ Port: 9270  │    │   Bridge    │
                    └─────────────┘    └─────────────┘
```

*AUT = Application Under Test

## Project Structure

```
perf-ci-demo/
├── README.md                    # This file
├── docker-compose.yml           # Main orchestration file
├── .env                        # Environment variables
├── Jenkinsfile                 # CI/CD pipeline definition
├── app/                        # Node.js application
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── jenkins/                    # Jenkins configuration
│   └── Dockerfile
├── jmeter/                     # JMeter configuration
│   ├── Dockerfile
│   ├── test-plan.jmx
│   └── users.csv
└── monitoring/                 # Monitoring configuration
    └── prometheus/
        └── prometheus.yml
```

## Components

### 1. Node.js Application (Port 3000)
- **Purpose**: Sample REST API serving as the application under test
- **Features**:
  - Health endpoint (`/health`)
  - Authentication endpoint (`/auth`)
  - Products endpoint (`/products`)
  - Shopping cart (`/cart`)
  - Checkout (`/checkout`)
  - Prometheus metrics (`/metrics`)
- **Metrics**: HTTP request duration histograms with method, route, and status code labels

### 2. Jenkins (Port 8080)
- **Purpose**: CI/CD automation server
- **Features**:
  - Docker-in-Docker (DooD) capability
  - Automated JMeter test execution
  - Results archiving
  - Pipeline as Code (Jenkinsfile)
- **Plugins**: Git, Pipeline, Docker integration

### 3. JMeter
- **Purpose**: Performance testing tool
- **Configuration**:
  - 10 virtual users
  - 5 iterations per user
  - 30-second ramp-up period
  - Tests health, products, and auth endpoints
- **Metrics**: Basic JMeter statistics (extensible with Prometheus listener)

### 4. Prometheus (Port 9090)
- **Purpose**: Metrics collection and storage
- **Targets**:
  - Application metrics from Node.js app
  - JMeter metrics (when Prometheus listener is configured)
- **Scrape Interval**: 5 seconds

### 5. Grafana (Port 3001)
- **Purpose**: Metrics visualization and dashboarding
- **Credentials**: admin/admin
- **Datasource**: Prometheus (http://prometheus:9090)

## Prerequisites

- Docker and Docker Compose
- At least 4GB RAM
- Ports 3000, 3001, 8080, and 9090 available

## Quick Start

### 1. Start the Stack

```bash
# Clone or navigate to the project directory
cd perf-ci-demo

# Start all services
docker compose up -d --build
```

### 2. Verify Services

```bash
# Check all containers are running
docker ps

# Test application health
curl http://localhost:3000/health

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Access Grafana
open http://localhost:3001
```

### 3. Setup Jenkins

```bash
# Get initial admin password
docker exec -it jenkins cat /var/jenkins_home/secrets/initialAdminPassword

# Open Jenkins in browser
open http://localhost:8080
```

1. Use the initial admin password
2. Install plugins (see Plugin Requirements below)
3. Create an admin user
4. Complete the setup

#### Jenkins Plugin Requirements

**Essential Plugins for this Stack:**

**Core CI/CD Plugins:**
- **Pipeline** - For Jenkinsfile support (pipeline as code)
- **Git** - For source code management
- **Docker Pipeline** - For Docker integration in pipelines
- **Credentials Binding** - For secure credential management

**Performance Testing Plugins:**
- **Performance** - For JMeter result analysis and trending
- **HTML Publisher** - For publishing JMeter HTML reports
- **Plot** - For creating performance trend graphs

**Utility Plugins:**
- **AnsiColor** - For colored console output (used in our Jenkinsfile)
- **Timestamper** - For timestamped console output
- **Build Timeout** - For build timeout management
- **Workspace Cleanup** - For cleaning workspaces

**Installation Options:**
1. **Quick Setup**: Choose "Install suggested plugins" during initial setup (includes most essentials)
2. **Manual**: Go to Manage Jenkins → Manage Plugins → Available and search for:
   - Performance Plugin (for JMeter integration)
   - Docker Pipeline Plugin (for our Docker-based pipeline)
   - HTML Publisher (for JMeter HTML reports)
   -  AnsiColor Plugin


**Why These Plugins:**
- **Pipeline**: Enables our `Jenkinsfile` to work
- **Git**: Source code checkout from repositories
- **Docker Pipeline**: Runs JMeter tests in containers
- **Performance**: Analyzes JMeter `.jtl` files and creates performance trends
- **HTML Publisher**: Makes JMeter's HTML reports available in Jenkins
- **AnsiColor**: Provides readable colored console output

### 4. Configure Jenkins Pipeline

1. Create a new Pipeline job
2. Configure it to use this repository
3. Set the pipeline script path to `Jenkinsfile`
4. Save and run the pipeline

## Manual Testing

### Test the Application Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Get products
curl http://localhost:3000/products

# Login (get token)
TOKEN=$(curl -s -X POST http://localhost:3000/auth \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq -r '.token')

# Add to cart (requires token)
curl -X POST http://localhost:3000/cart \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Checkout
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json"

# View metrics
curl http://localhost:3000/metrics
```

### Run JMeter Tests Manually

```bash
# Build JMeter image
docker build -t jmeter-custom ./jmeter

# Create output directory
mkdir -p out

# Run performance test
docker run --rm \
  --network=jenkins_net \
  -v "$(pwd)/jmeter:/work/jmeter:ro" \
  -v "$(pwd)/out:/work/out" \
  jmeter-custom -n \
  -t /work/jmeter/test-plan.jmx \
  -Jhost=application -Jport=3000 \
  -l /work/out/results.jtl \
  -e -o /work/out/report
```

## Monitoring and Metrics

### Prometheus Queries

Access Prometheus at http://localhost:9090 and try these queries:

```promql
# HTTP request rate
rate(http_request_duration_ms_count[5m])

# 95th percentile response time
histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))

# Error rate
rate(http_request_duration_ms_count{status_code!~"2.."}[5m]) / rate(http_request_duration_ms_count[5m])

# Request count by endpoint
sum by (route) (http_request_duration_ms_count)
```

### Grafana Dashboards

1. Open Grafana at http://localhost:3001
2. Login with admin/admin
3. Add Prometheus datasource: http://prometheus:9090
4. Create dashboards with panels for:
   - Request rate by endpoint
   - Response time percentiles
   - Error rates
   - Active threads (if JMeter Prometheus listener is configured)

Sample dashboard panels:

**API Request Rate:**
```promql
sum(rate(http_request_duration_ms_count[5m])) by (route)
```

**95th Percentile Response Time:**
```promql
histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route))
```

**Error Rate:**
```promql
sum(rate(http_request_duration_ms_count{status_code!~"2.."}[1m])) / sum(rate(http_request_duration_ms_count[1m]))
```

## Jenkins Pipeline

The included Jenkinsfile defines a complete CI/CD pipeline:

### Pipeline Stages:

1. **Checkout**: Gets the source code
2. **Build JMeter Image**: Creates the JMeter container
3. **Wait for AUT**: Ensures the application is healthy
4. **Run JMeter Tests**: Executes performance tests
5. **Archive**: Saves test results as artifacts

### Environment Variables:

- `AUT_HOST`: Application hostname (application)
- `AUT_PORT`: Application port (3000)
- `DOCKER_NETWORK`: Docker network name (jenkins_net)
- `JMETER_IMAGE`: JMeter image name (jmeter-prom:latest)

## Configuration

### Customizing the Application

Edit `app/server.js` to:
- Add new endpoints
- Modify response times
- Change business logic
- Add more metrics

### Customizing JMeter Tests

Edit `jmeter/test-plan.jmx` to:
- Change thread count and ramp-up
- Add new test scenarios
- Modify request parameters
- Add assertions

### Customizing Monitoring

Edit `monitoring/prometheus/prometheus.yml` to:
- Change scrape intervals
- Add new targets
- Configure alerting rules

## Troubleshooting

### Common Issues

**Container fails to start:**
```bash
# Check logs
docker logs <container-name>

# Check resource usage
docker stats
```

**Network connectivity issues:**
```bash
# List networks
docker network ls

# Inspect network
docker network inspect jenkins_net

# Test connectivity between containers
docker exec -it application ping prometheus
```

**Port conflicts:**
```bash
# Check what's using ports
sudo lsof -i :8080
sudo lsof -i :3000
sudo lsof -i :9090
sudo lsof -i :3001
```

**Jenkins build fails:**
```bash
# Check Jenkins logs
docker logs jenkins

# Verify Docker socket access
docker exec jenkins docker ps
```

### Performance Issues

**High memory usage:**
- Reduce JMeter thread count
- Adjust Docker memory limits
- Monitor container stats

**Slow response times:**
- Check application logs
- Monitor system resources
- Verify network connectivity

## Advanced Configuration

### Adding Prometheus Listener to JMeter

For production use, add the Prometheus listener JAR:

1. Download the JAR from the project releases
2. Place it in `jmeter/jmeter-prometheus-listener.jar`
3. Uncomment the COPY line in `jmeter/Dockerfile`
4. Configure the listener in your test plan

### Production Considerations

**Security:**
- Change default passwords
- Use secrets management
- Enable HTTPS/TLS
- Restrict network access

**Scalability:**
- Use external databases
- Implement persistent storage
- Add load balancers
- Configure auto-scaling

**Monitoring:**
- Add alerting rules
- Configure log aggregation
- Implement health checks
- Set up monitoring dashboards

## Educational Extensions

### Beginner Projects:
1. Add new API endpoints to the Node.js app
2. Create custom Grafana dashboards
3. Modify JMeter test scenarios
4. Add simple alerting rules

### Intermediate Projects:
1. Implement database integration
2. Add authentication/authorization
3. Create multi-stage environments
4. Implement blue-green deployments

### Advanced Projects:
1. Add microservices architecture
2. Implement service mesh monitoring
3. Add distributed tracing
4. Create chaos engineering tests

## References and Learning Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Jenkins Pipeline Documentation](https://www.jenkins.io/doc/book/pipeline/)
- [JMeter User Manual](https://jmeter.apache.org/usermanual/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)

## License

This project is provided for educational purposes. Feel free to modify and distribute.

## Contributing

This is an educational project. Feel free to:
- Report issues
- Suggest improvements
- Add new features
- Create learning modules

---

**Happy Learning!** 🚀

For questions or issues, please check the troubleshooting section or refer to the official documentation of each component.