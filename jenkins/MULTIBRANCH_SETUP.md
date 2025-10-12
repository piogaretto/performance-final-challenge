# Jenkins Multibranch Pipeline Setup for Performance Testing

## Overview

This guide explains how to configure Jenkins for automated performance testing with comprehensive report publishing across multiple branches.

## Required Jenkins Plugins

Before setting up the multibranch pipeline, ensure these plugins are installed:

### Core Plugins (Required)
```
- Pipeline: Multibranch
- Pipeline: Stage View
- Git plugin
- Docker Pipeline
- Workspace Cleanup
```

### Report Publishing Plugins (Essential)
```
- HTML Publisher plugin
- Build Timestamp plugin
- AnsiColor
- Performance plugin (optional)
- JUnit plugin (for XML results)
```

## Multibranch Pipeline Configuration

### 1. Create Multibranch Pipeline Job

1. **Jenkins Dashboard** → **New Item**
2. **Item name**: `performance-testing-pipeline`
3. **Type**: **Multibranch Pipeline**
4. Click **OK**

### 2. Configure Branch Sources

#### Git Configuration
```
Branch Sources → Add source → Git
Repository URL: [your-git-repository-url]
Credentials: [your-git-credentials]

Behaviors:
✅ Discover branches
   - Strategy: All branches
✅ Discover pull requests from origin
   - Strategy: Merging the pull request with the current target branch revision
✅ Clean before checkout
✅ Clean after checkout
```

#### Branch Discovery
```
Property strategy: All branches get the same properties
Build strategies:
✅ Regular branches
✅ Also build pull requests
✅ Skip initial build on first branch indexing
```

### 3. Build Configuration

#### Pipeline Script
```
Mode: by Jenkinsfile
Script Path: Jenkinsfile
```

#### Scan Multibranch Pipeline Triggers
```
✅ Periodically if not otherwise run
Interval: 1 minute
```

## Performance Report Configuration

The enhanced Jenkinsfile automatically configures multiple report types:

### 1. HTML Publisher Reports

The pipeline publishes two HTML reports:

#### JMeter Performance Report
```groovy
publishHTML([
  allowMissing: false,
  alwaysLinkToLastBuild: true,
  keepAll: true,
  reportDir: "out/jmeter-report",
  reportFiles: 'index.html',
  reportName: 'JMeter Performance Report',
  reportTitles: 'JMeter HTML Dashboard'
])
```

#### Performance Summary Report
```groovy
publishHTML([
  allowMissing: false,
  alwaysLinkToLastBuild: true,
  keepAll: true,
  reportDir: "reports/generated",
  reportFiles: 'performance_summary.html',
  reportName: 'Performance Summary',
  reportTitles: 'Performance Test Summary'
])
```

### 2. Artifact Archival

All test artifacts are automatically archived:
```
- out/** (JMeter results, HTML reports, raw data)
- reports/** (Technical and business reports)
- Prometheus metrics (JSON format)
```

### 3. Build Status Integration

The pipeline automatically sets build status based on performance results:
- **SUCCESS**: ≥95% success rate
- **UNSTABLE**: 80-94% success rate
- **FAILURE**: <80% success rate

## Accessing Published Reports

### From Build Page
After pipeline execution, reports are available from the build page:

1. **Build #X** → **JMeter Performance Report**
   - Complete JMeter HTML dashboard with charts and graphs
   - Response time trends, throughput analysis
   - Error analysis and percentiles

2. **Build #X** → **Performance Summary**
   - Executive summary with key metrics
   - Success/failure status with color coding
   - Links to detailed reports

### From Job Dashboard
Reports are also accessible from the job's main page:
- **Latest JMeter Performance Report** (always links to latest build)
- **Latest Performance Summary** (always links to latest build)

## Branch-Specific Features

### Branch Name Integration
The pipeline automatically includes branch information in reports:
```groovy
echo "Starting Performance Testing Pipeline for ${env.BRANCH_NAME}"
```

### Parallel Branch Testing
Multiple branches can be tested simultaneously without conflicts due to:
- Isolated workspace per branch
- Unique container names per build
- Separate artifact storage

### Pull Request Integration
For pull requests, the pipeline provides:
- Performance comparison against target branch
- Automated performance regression detection
- Comment posting on PR with results (optional)

## Advanced Configuration Options

### 1. Performance Thresholds

Customize success criteria in the `Performance Analysis` stage:
```groovy
// Current thresholds
if (successRate >= 95) {
  currentBuild.result = 'SUCCESS'
} else if (successRate >= 80) {
  currentBuild.result = 'UNSTABLE'
} else {
  currentBuild.result = 'FAILURE'
}
```

### 2. Notification Integration

Add notifications in the `post` section:
```groovy
post {
  failure {
    emailext (
      subject: "Performance Test Failed: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
      body: "Performance test failed. Check reports: ${env.BUILD_URL}",
      to: "${env.CHANGE_AUTHOR_EMAIL}"
    )
  }
}
```

### 3. Trend Analysis

Enable performance trending by adding:
```groovy
// In Archive Results stage
perfReport sourceDataFiles: 'out/results.jtl'
```

## Security Considerations

### Docker Socket Access
The pipeline requires Docker access for running JMeter containers:
```yaml
# docker-compose.yml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

### Network Isolation
All testing occurs within the isolated `jenkins_net` Docker network:
- No external network access during tests
- Consistent service discovery
- Reproducible test conditions

## Troubleshooting

### Common Issues

#### 1. HTML Reports Not Publishing
```bash
# Check plugin installation
Jenkins → Manage Plugins → Installed → Search "HTML Publisher"

# Verify report directory exists
echo "Report directory contents:"
ls -la reports/generated/
```

#### 2. Docker Container Issues
```bash
# Check Docker daemon accessibility
docker ps

# Verify network exists
docker network ls | grep jenkins_net
```

#### 3. Permission Issues
```bash
# Fix workspace permissions
sudo chown -R jenkins:jenkins $WORKSPACE
```

### Logs and Debugging

Enable detailed logging by adding to Jenkinsfile:
```groovy
environment {
  // ... existing variables
  DEBUG = 'true'
}
```

## Performance Optimization

### Build Retention
Configure build retention to manage storage:
```groovy
options {
  buildDiscarder(logRotator(
    numToKeepStr: '10',          // Keep 10 builds
    artifactNumToKeepStr: '5'    // Keep artifacts for 5 builds
  ))
}
```

### Parallel Execution
For multiple test scenarios, enable parallel execution:
```groovy
parallel {
  stage('Load Test') { /* ... */ }
  stage('Stress Test') { /* ... */ }
  stage('Spike Test') { /* ... */ }
}
```

## Monitoring and Alerting

### Grafana Integration
Link Jenkins builds to Grafana dashboards:
- Add build metadata to Prometheus metrics
- Create Jenkins build status dashboard
- Set up alerting for failed performance tests

### Webhook Integration
Configure webhooks for external systems:
```groovy
post {
  always {
    sh """
      curl -X POST ${WEBHOOK_URL} \
        -H 'Content-Type: application/json' \
        -d '{"build": "${BUILD_NUMBER}", "status": "${currentBuild.result}"}'
    """
  }
}
```

This configuration provides enterprise-grade performance testing automation with comprehensive reporting and monitoring capabilities suitable for continuous integration environments.