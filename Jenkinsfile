pipeline {
  agent any

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }

  environment {
    AUT_HOST = 'application'
    AUT_PORT = '3000'
    DOCKER_NETWORK = 'jenkins_net'
    OUT_DIR = 'out'
    REPORTS_DIR = 'reports'
    JMETER_IMAGE = 'jmeter-prom:latest'
    JMETER_PROM_PORT = '9270'
    JMETER_CONTAINER_NAME = 'jmeter-run'
    SLA_P95_MS = '800'
    SLA_ERR_PCT = '1.0'
    SLA_AVG_MS = '1000'
    SLA_MAX_MS = '5000'
  }

  parameters {
    string(name: 'threads', defaultValue: '10', description: 'Usuarios concurrentes')
    string(name: 'ramp',    defaultValue: '30', description: 'Ramp-up (s)')
    string(name: 'loops',   defaultValue: '5',  description: 'Loops por usuario')
    string(name: 'SLA_MS',  defaultValue: '800', description: 'SLA por request (ms)')
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        echo "Starting Performance Testing Pipeline for ${env.BRANCH_NAME}"
      }
    }

    stage('Build JMeter Image') {
      steps {
        sh """
          docker build -t ${JMETER_IMAGE} ./jmeter
        """
      }
    }

    stage('Wait for AUT') {
      steps {
        sh """
          echo "Waiting for Application Under Test to be ready..."
          for i in {1..90}; do
            if curl -fsS http://${AUT_HOST}:${AUT_PORT}/health >/dev/null 2>&1; then
              echo 'AUT is ready'; exit 0
            fi
            echo "Attempt \$i/90: AUT not ready, waiting..."
            sleep 2
          done
          echo 'AUT not healthy after 3 minutes'; exit 1
        """
      }
    }

    stage('Run Performance Tests') {
      steps {
        sh """
          echo "=== Starting JMeter Performance Tests ==="
          rm -rf ${OUT_DIR}
          mkdir -p ${OUT_DIR}

          docker rm -f ${JMETER_CONTAINER_NAME} >/dev/null 2>&1 || true

          docker run -d \
            --name ${JMETER_CONTAINER_NAME} \
            --network=${DOCKER_NETWORK} \
            -p 9270:9270 \
            --memory=1g \
            --memory-swap=2g \
            --shm-size=256m \
            --entrypoint="" \
            ${JMETER_IMAGE} sleep 3600
          
          docker exec ${JMETER_CONTAINER_NAME} mkdir -p /work/jmeter /work/out
          docker cp jmeter/. ${JMETER_CONTAINER_NAME}:/work/jmeter/
          docker exec ${JMETER_CONTAINER_NAME} rm -f /work/out/results.jtl || true
          docker exec ${JMETER_CONTAINER_NAME} rm -rf /work/out/jmeter-report || true
          
          echo "=== DEBUG: Container JMeter directory contents ==="
          docker exec ${JMETER_CONTAINER_NAME} ls -la /work/jmeter/ || echo "Could not list files"
          
          set +e
          echo "=== Running JMeter tests with 5-minute timeout ==="
          timeout 300 docker exec ${JMETER_CONTAINER_NAME} jmeter -n \
            -t /work/jmeter/test-plan.jmx \
            -l /work/out/results.jtl \
            -j /work/out/jmeter.log \
            -e -o /work/out/jmeter-report \
            -f \
            -Jjmeter.save.saveservice.output_format=csv \
            -Jjmeter.save.saveservice.response_data=false \
            -Jjmeter.save.saveservice.samplerData=false \
            -Jprometheus.ip=0.0.0.0 \
            -Jprometheus.port=9270 \
            -Dprometheus.ip=0.0.0.0 \
            -Dprometheus.port=9270 \
            -Jthreads=${threads} -Jramp=${ramp} -Jloops=${loops} -JSLA_MS=${SLA_MS} \
            -Jhost=${AUT_HOST} -Jport=${AUT_PORT} \
            -Jjmeter.save.saveservice.responseHeaders=false
          JMETER_EXIT_CODE=\$?
          set -e

          if [ \$JMETER_EXIT_CODE -eq 124 ]; then
            echo "=== JMeter test timed out after 5 minutes ==="
            docker kill ${JMETER_CONTAINER_NAME} >/dev/null 2>&1 || true
          fi
          echo "=== JMeter container exit code: \$JMETER_EXIT_CODE ==="

          CONTAINER_STATUS=\$(docker inspect ${JMETER_CONTAINER_NAME} --format='{{.State.Status}}' 2>/dev/null || echo "not-found")
          echo "=== Container status: \$CONTAINER_STATUS ==="
          
          if [ "\$CONTAINER_STATUS" != "not-found" ]; then
            echo "=== JMeter container logs ==="
            docker logs ${JMETER_CONTAINER_NAME} 2>/dev/null || echo "Could not retrieve logs"
            echo "=== DEBUG: Container output directory contents ==="
            docker exec ${JMETER_CONTAINER_NAME} ls -la /work/out/ 2>/dev/null || echo "No output directory in container or container not accessible"
            echo "=== Copying results from container to workspace ==="
            docker cp ${JMETER_CONTAINER_NAME}:/work/out/. ${OUT_DIR}/ 2>/dev/null || echo "Could not copy results from container"
            docker stop ${JMETER_CONTAINER_NAME} >/dev/null 2>&1 || true
            docker rm ${JMETER_CONTAINER_NAME} >/dev/null 2>&1 || true
          else
            echo "=== Container not found - may have been auto-removed ==="
          fi
          
          echo "=== DEBUG: Final workspace output directory contents ==="
          ls -la ${OUT_DIR}/
          
          if [ -f "${OUT_DIR}/results.jtl" ]; then
            echo "=== JMeter Test Results Generated Successfully ==="
            echo "\$JMETER_EXIT_CODE" > ${OUT_DIR}/jmeter_exit_code.txt   # ### [CAMBIO] guardo exit code
            echo "Total lines in results: \$(wc -l < ${OUT_DIR}/results.jtl)"
            head -5 ${OUT_DIR}/results.jtl || true
          else
            echo "ERROR: No results.jtl file generated"
            exit 1
          fi

          # ### [CAMBIO] NO salgo con el exit code de JMeter aquí; el Quality Gate decide
          true
        """
      }
    }

    stage('Generate Performance Reports') {
      steps {
        sh """
          set -e
          echo "=== Generating Performance Summary ==="

          # carpetas
          rm -rf ${REPORTS_DIR}/generated
          mkdir -p ${REPORTS_DIR}/generated

          # ---- métricas desde out/results.jtl ----
          if [ -f "${OUT_DIR}/results.jtl" ]; then
            TOTAL_REQUESTS=\$(tail -n +2 "${OUT_DIR}/results.jtl" | wc -l)
            SUCCESS_REQUESTS=\$(tail -n +2 "${OUT_DIR}/results.jtl" | awk -F',' '\$8=="true"' | wc -l)
            ERROR_REQUESTS=\$(tail -n +2 "${OUT_DIR}/results.jtl" | awk -F',' '\$8=="false"' | wc -l)

            if [ "\$TOTAL_REQUESTS" -gt 0 ]; then
              SUCCESS_RATE=\$(awk -v s=\$SUCCESS_REQUESTS -v t=\$TOTAL_REQUESTS 'BEGIN{printf "%.1f", (s*100)/t}')
              ERROR_RATE=\$(awk -v e=\$ERROR_REQUESTS -v t=\$TOTAL_REQUESTS 'BEGIN{printf "%.1f", (e*100)/t}')
            else
              SUCCESS_RATE="0.0"; ERROR_RATE="0.0"
            fi

            AVG_RESPONSE=\$(tail -n +2 "${OUT_DIR}/results.jtl" | awk -F',' '{sum+=\$2; n++} END{print (n>0?int(sum/n):0)}')
            MIN_RESPONSE=\$(tail -n +2 "${OUT_DIR}/results.jtl" | awk -F',' 'NR==1{m=\$2} {if(\$2<m)m=\$2} END{print (m==""?0:int(m))}')
            MAX_RESPONSE=\$(tail -n +2 "${OUT_DIR}/results.jtl" | awk -F',' '{if(\$2>M)M=\$2} END{print (M==""?0:int(M))}')
            P95_RESPONSE=\$(tail -n +2 "${OUT_DIR}/results.jtl" | awk -F',' '{print \$2}' | sort -n | awk '{a[NR]=\$1} END{if(NR==0)print 0; i=int(0.95*NR); if(i<1)i=1; if(i>NR)i=NR; print a[i] }')
          else
            TOTAL_REQUESTS=0; SUCCESS_REQUESTS=0; ERROR_REQUESTS=0
            SUCCESS_RATE="0.0"; ERROR_RATE="0.0"
            AVG_RESPONSE=0; MIN_RESPONSE=0; MAX_RESPONSE=0; P95_RESPONSE=0
          fi

          # rama amigable
          BRANCH_VAL="\${BRANCH_NAME:-\${GIT_BRANCH:-develop}}"

          # copiamos artefactos al mismo folder del summary para que los links funcionen
          cp -r ${OUT_DIR}/jmeter-report ${REPORTS_DIR}/generated/ 2>/dev/null || true
          cp ${OUT_DIR}/results.jtl ${REPORTS_DIR}/generated/ 2>/dev/null || true

          # ---- HTML (encabezado) ----
          cat > ${REPORTS_DIR}/generated/performance_summary.html <<EOF
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8"/>
              <title>Performance Test Summary - Build #${BUILD_NUMBER}</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { background:#f8f9fa; padding: 14px; border-radius: 6px; }
                .metrics { display:flex; flex-wrap:wrap; gap:16px; margin: 18px 0; }
                .card { background:#e3f2fd; padding:14px; border-radius:8px; min-width:220px; }
                .ok{color:#2e7d32} .warn{color:#ef6c00} .bad{color:#c62828}
                table{border-collapse:collapse;width:100%;margin-top:12px}
                th,td{border:1px solid #ddd;padding:8px;text-align:left}
                th{background:#f2f2f2}
              </style>
            </head>
            <body>
              <div class="header">
                <h1>🚀 Performance Test Report</h1>
                <p><strong>Build:</strong> #${BUILD_NUMBER} |
                  <strong>Date:</strong> $(date)</p>
                <p><strong>Test Environment:</strong> Docker Containerized |
                  <strong>Application:</strong> E-commerce API</p>
              </div>

              <div class="metrics">
                <div class="card"><h3>📊 Test Volume</h3>
                  <p><strong>\${TOTAL_REQUESTS}</strong> Total Requests</p></div>
                <div class="card"><h3>✅ Success Rate</h3>
                  <p class="\$([ \${SUCCESS_RATE%.*} -ge 95 ] && echo ok || echo warn)">
                    <strong>\${SUCCESS_RATE}%</strong> (\${SUCCESS_REQUESTS}/\${TOTAL_REQUESTS})
                  </p></div>
                <div class="card"><h3>⚡ Response Times</h3>
                  <p><strong>\${AVG_RESPONSE} ms</strong> Avg · <strong>\${P95_RESPONSE} ms</strong> p95</p>
                  <p><strong>\${MIN_RESPONSE}–\${MAX_RESPONSE} ms</strong> Range</p>
                </div>
              </div>

              <h2>🔗 Additional Reports</h2>
              <ul>
                <li><a href="jmeter-report/index.html">📊 Detailed JMeter HTML Report</a></li>
                <li><a href="results.jtl">📄 Raw Test Results (JTL)</a></li>
              </ul>
            EOF

                  # ---- cierre del HTML (sin expansión) ----
                  cat >> ${REPORTS_DIR}/generated/performance_summary.html <<'EOF'
            </body>
            </html>
            EOF

                  echo "Performance summary report generated"
                """
  }
}


    stage('Collect Prometheus Metrics (JMeter)') {
  steps {
    sh """
      set -e
      echo "=== Collecting JMeter metrics from Prometheus ==="
      mkdir -p ${OUT_DIR}/prom

      # RPS por sampler (label)
      curl -s -G "http://prometheus:9090/api/v1/query" \
        --data-urlencode 'query=sum by (label) (rate(jmeter_requests_total[1m]))' \
        | jq . > ${OUT_DIR}/prom/jmeter_rps_by_label.json || true

      # Error % global (ventana 1m)
      curl -s -G "http://prometheus:9090/api/v1/query" \
        --data-urlencode 'query=100 * ( sum(rate(jmeter_requests_errors_total[1m])) or vector(0) ) / clamp_min(sum(rate(jmeter_requests_total[1m])), 1e-9 )' \
        | jq . > ${OUT_DIR}/prom/jmeter_error_pct.json || true

      # p95 por sampler (ms) desde histograma
      curl -s -G "http://prometheus:9090/api/v1/query" \
        --data-urlencode 'query=histogram_quantile(0.95, sum by (le,label) (rate(jmeter_request_duration_ms_bucket[1m])))' \
        | jq . > ${OUT_DIR}/prom/jmeter_p95_by_label.json || true

      # (Opcional) dump directo del endpoint del listener
      curl -s http://jmeter-run:9270/metrics > ${OUT_DIR}/prom/jmeter_raw_metrics.txt || true

      echo "✔ JMeter metrics collected → ${OUT_DIR}/prom"
    """
  }
}

    stage('Archive Results') {
      steps {
        script {
          echo "=== Archiving All Performance Testing Artifacts ==="

          if (fileExists("${OUT_DIR}/results.jtl")) {
            archiveArtifacts artifacts: "${OUT_DIR}/**", fingerprint: true
            echo "✅ JMeter results and HTML reports archived"
            try {
              perfReport(
                sourceDataFiles: "${OUT_DIR}/results.jtl",
                modeOfThreshold: true,
                configType: 'ART',
                modePerformancePerTestCase: true,
                compareBuildPrevious: true,
                modeThroughput: true,
                nthBuildNumber: 0,
                errorFailedThreshold: 5,
                errorUnstableThreshold: 10,
                relativeFailedThresholdPositive: 20,
                relativeFailedThresholdNegative: 0,
                relativeUnstableThresholdPositive: 50,
                relativeUnstableThresholdNegative: 0,
                modeEvaluation: true
              )
              echo "✅ Performance trends and analysis configured"
            } catch (Exception e) {
              echo "⚠️ Performance Plugin not available: ${e.message}"
            }
          }

          if (fileExists("${REPORTS_DIR}")) {
            archiveArtifacts artifacts: "${REPORTS_DIR}/**", fingerprint: true
            echo "✅ Performance analysis reports archived"
          }

          publishHTML([
            allowMissing: false,
            alwaysLinkToLastBuild: true,
            keepAll: true,
            reportDir: "${OUT_DIR}/jmeter-report",
            reportFiles: 'index.html',
            reportName: 'JMeter Performance Report',
            reportTitles: 'JMeter HTML Dashboard'
          ])

          publishHTML([
            allowMissing: false,
            alwaysLinkToLastBuild: true,
            keepAll: true,
            reportDir: "${REPORTS_DIR}/generated",
            reportFiles: 'performance_summary.html',
            reportName: 'Performance Summary',
            reportTitles: 'Performance Test Summary'
          ])
        }
      }
    }

    // ### [CAMBIO] Etapa Quality Gate: decide SUCCESS/UNSTABLE según aserciones y SLA
    stage('Quality Gate (SLA & Assertions)') {
      when { expression { fileExists("${OUT_DIR}/results.jtl") } }
      steps {
        sh """
          echo "=== Quality Gate: Evaluating SLA & Assertions ==="

          TOTAL=\$(tail -n +2 ${OUT_DIR}/results.jtl | wc -l)
          FAILS=\$(tail -n +2 ${OUT_DIR}/results.jtl | awk -F',' '\$8=="false"' | wc -l)
          ERR_PCT=\$(awk -v f=\$FAILS -v t=\$TOTAL 'BEGIN{ if(t==0) print 0; else printf "%.1f", (f*100)/t }')
          AVG_MS=\$(tail -n +2 ${OUT_DIR}/results.jtl | awk -F',' '{sum+=\$2; n++} END{ if(n==0) print 0; else print int(sum/n) }')
          MAX_MS=\$(tail -n +2 ${OUT_DIR}/results.jtl | awk -F',' '{if(\$2>m) m=\$2} END{ print int(m+0) }')
          P95_MS=\$(tail -n +2 ${OUT_DIR}/results.jtl | awk -F',' '{print \$2}' | sort -n | awk ' {a[NR]=\$1} END{ if (NR==0) print 0; else { idx=int(0.95*NR); if(idx<1) idx=1; if(idx>NR) idx=NR; print a[idx] } }')

          echo "TOTAL=\$TOTAL | FAILS=\$FAILS | ERR_PCT=\$ERR_PCT | AVG_MS=\$AVG_MS | P95_MS=\$P95_MS | MAX_MS=\$MAX_MS"
          
          UNSTABLE_REASON=""
          if [ "\$FAILS" -gt 0 ]; then
            UNSTABLE_REASON="\$UNSTABLE_REASON Assertions/errores de muestra > 0. "
          fi
          # comparar p95 con SLA_P95_MS (enteros)
          if [ "\$P95_MS" -gt "${SLA_P95_MS}" ]; then
            UNSTABLE_REASON="\$UNSTABLE_REASON p95 \$P95_MS ms > ${SLA_P95_MS} ms. "
          fi
          # comparar error rate con SLA_ERR_PCT (string float) sin 'bc': usamos awk
          AWK_GT=\$(awk -v a=\$ERR_PCT -v b=${SLA_ERR_PCT} 'BEGIN{ if (a>b) print 1; else print 0 }')
          if [ "\$AWK_GT" -eq 1 ]; then
            UNSTABLE_REASON="\$UNSTABLE_REASON Error rate \$ERR_PCT% > ${SLA_ERR_PCT}%. "
          fi

          echo "UNSTABLE_REASON=\$UNSTABLE_REASON"
          echo "\$UNSTABLE_REASON" > ${OUT_DIR}/quality_gate_reason.txt

          # Salida NO fatal; dejamos que Jenkinsfile decida con currentBuild.result
          if [ -n "\$UNSTABLE_REASON" ]; then
            exit 3
          else
            exit 0
          fi
        """
      }
      post {
        unsuccessful {
          script {
            currentBuild.result = 'UNSTABLE'
            echo "⚠️  Quality Gate UNSTABLE - Motivo: " + readFile("${OUT_DIR}/quality_gate_reason.txt").trim()
          }
        }
        success {
          echo "✅ Quality Gate PASS (SLA y aserciones OK)"
        }
      }
    }

    // (Opcional) análisis más detallado, mantenemos tu lógica
    stage('Performance Analysis') {
      when { expression { fileExists("${OUT_DIR}/results.jtl") } }
      steps {
        script {
          def results = sh(script: "tail -n +2 ${OUT_DIR}/results.jtl | wc -l", returnStdout: true).trim().toInteger()
          def errors  = sh(script: "tail -n +2 ${OUT_DIR}/results.jtl | awk -F',' '\$8==\"false\"' | wc -l", returnStdout: true).trim().toInteger()
          def successRate = results>0 ? ((results - errors) * 100.0 / results) : 0.0
          def avgResponse = sh(script: "tail -n +2 ${OUT_DIR}/results.jtl | awk -F',' '{sum+=\$2; n++} END{ if(n==0) print 0; else print int(sum/n) }'", returnStdout: true).trim().toInteger()
          def maxResponse = sh(script: "tail -n +2 ${OUT_DIR}/results.jtl | awk -F',' '{if(\$2>m) m=\$2} END{ print int(m+0) }'", returnStdout: true).trim().toInteger()
          def p95Response = sh(script: "tail -n +2 ${OUT_DIR}/results.jtl | awk -F',' '{print \$2}' | sort -n | awk ' {a[NR]=\$1} END{ if (NR==0) print 0; else { idx=int(0.95*NR); if(idx<1) idx=1; if(idx>NR) idx=NR; print a[idx] } }'", returnStdout: true).trim().toInteger()

          echo "📊 Results: total=${results} errors=${errors} successRate=${String.format('%.1f', successRate)}% avg=${avgResponse}ms p95=${p95Response}ms max=${maxResponse}ms"

          currentBuild.description = "Success: ${String.format('%.1f', successRate)}% | Avg: ${avgResponse}ms | p95: ${p95Response}ms | Max: ${maxResponse}ms | Req: ${results}"
        }
      }
    }
  }

  post {
    always {
      echo "=== Performance Testing Pipeline Complete ==="
      echo "Build: ${env.BUILD_URL}"
    }
    success {
      echo "✅ Performance testing completed successfully"
    }
    unstable {
      echo "⚠️  Performance testing completed with warnings (Quality Gate)"
    }
    failure {
      echo "❌ Performance testing failed"
    }
    cleanup {
      sh """
        docker rm -f ${JMETER_CONTAINER_NAME} >/dev/null 2>&1 || true
        echo "Cleanup completed"
      """
    }
  }
}
