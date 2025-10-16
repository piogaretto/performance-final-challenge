# 🚀 Pruebas de Rendimiento End-to-End con Jenkins, JMeter, Prometheus y Grafana

Este proyecto implementa un pipeline completo de CI/CD y pruebas de performance sobre una API de e-commerce (autenticación, productos, carrito y checkout), utilizando Docker Compose para levantar todo el entorno de forma reproducible.


## Arquitectura general

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

## Estructura del proyecto

```
perf-ecommerce-pipeline/
├── README.md
├── docker-compose.yml
├── .env
├── Jenkinsfile
├── app/                      # API Node.js (e-commerce)
│   ├── Dockerfile
│   ├── server.js
│   └── package.json
├── jenkins/                  # Jenkins con Docker-in-Docker
│   └── Dockerfile
├── jmeter/                   # Configuración de JMeter y plan de pruebas
│   ├── Dockerfile
│   ├── test-plan.jmx
|   ├── jmeter-prometheus-plugin.jar
│   └── users.csv
└── monitoring/
    └── prometheus/
        └── prometheus.yml
```

# ⚙️ Componentes
### 🛒 1. Aplicación Node.js (Puerto 3000)

- **API** simulada de e-commerce con endpoints:
- `/health` — Estado del servicio
- `/auth` — Autenticación (genera token)
- `/products` — Catálogo de productos
- `/cart` — Operaciones de carrito
- `/checkout` — Proceso de pago
- `/metrics` — Exposición de métricas Prometheus

### ⚙️ 2. Jenkins (Puerto 8080)

- **Servidor CI/CD** con Pipeline Declarativo
- Ejecuta pruebas de performance en **contenedor efímero**
- Publica reportes HTML y métricas
- Implementa un Gate de calidad (errores %, p95, SLA)

### 🔥 3. Apache JMeter (headless)

- **Versión: 5.6.3**
- **Pruebas E2E parametrizadas:**
  - Threads, ramp-up, loops, host, port, SLA_MS (por defecto 800 ms)
Correlación automática de token JWT (login)

- **Aserciones:**

  - Códigos HTTP 200
responseTime <= SLA_MS (JSR223 - Groovy)

- **Prometheus Listener expone:**
  - `jmeter_requests_total`
  - `jmeter_requests_errors_total`
  - `jmeter_request_duration_ms`

### 📊 4. Prometheus (Puerto 9090)

- Recolecta métricas de la aplicación y de JMeter

### 📈 5. Grafana (Puerto 3001)

- Dashboards para **monitoreo en tiempo real**
- Paneles de **throughput, p95 y tasa de errores.**

---

# 🚀 Puesta en Marcha


- 1️ - **Requisitos previos:**
  - Docker y Docker Compose instalados
  - 4 GB de RAM mínimos
  - Puertos 3000, 3001, 8080 y 9090 disponibles

- 2️ - **Levantar el entorno:**
  - `git clone https://github.com/piogaretto/performance-final-challenge.git`
  
  - `cd perf-ecommerce-pipeline`

  - `docker compose up -d --build`

- 3 - **Verificar servicios:**

```bash
# Verificar contenedores
docker ps

# Verificar health
curl http://localhost:3000/health

# Verificar targets de Prometheus
curl http://localhost:9090/api/v1/targets

# Verificar acceso a Grafana
open http://localhost:3001
```
---
### 3. Configuración de Jenkins

```bash
# Obtener password inicial
docker exec -it jenkins cat /var/jenkins_home/secrets/initialAdminPassword

# Acceder a Jenkins
open http://localhost:8080
```

1. Usa la contraseña inicial.
2. Instala Plugins requeridos.
3. Crea un usuario admin.

### Plugins

**Plugins de CI/CD:**
- **Pipeline** - Para soporte de archivo jenkins.
- **Git** - Para manejo del código fuente.
- **Docker Pipeline** - Integración con Docker
- **Credentials Binding** - Administración de credenciales.

**Plugins de performance:**
- **Performance** - Para análisis de resultados y reportes.
- **HTML Publisher** - Para publicar reportes HTML de JMeter
- **Plot** - Para crear gráficos de rendimiento.

**Plugins de utilidad:**
- **AnsiColor** - Para salida en consola con colores.
- **Timestamper** - Salida en consola con marcas de tiempo.
- **Build Timeout** - Para manejar los timeouts de las builds.
- **Workspace Cleanup** - Para espacios de trabajo más sencillos.

*Si algunos plugins no aparecen durante la configuración inicial de Jenkins instalalos de forma manual más tarde.*


### 4. Configurar pipeline

1. Crear pipeline.
2. Configurarlo para usar este repositorio.
3. Definir el path del pipeline como `Jenkinsfile`
4. Guardar y correr el pipeline.

---

## Monitoreo y métricas

### Queries de Prometheus
Entra a Prometheus: `http://localhost:9090`

Prueba las siguientes queries:

```promql
# Throughput

sum by (label) (rate(jmeter_requests_total[1m]))

# p95 por endpoint

histogram_quantile(0.95, sum by (le,label) (rate(jmeter_request_duration_ms_bucket[1m])) )


# Tasa de error

100 * sum(rate(jmeter_requests_errors_total[1m])) / clamp_min(sum(rate(jmeter_requests_total[1m])), 1e-9)
```

### Visualización en Grafana

1. Entra a Grafana `http://localhost:3001`
2. Inicia con admin/admin
3. Añade Prometheus como datasource: `http://prometheus:9090`
4. Crea visualizaciones para cada query:
   - Tasa de error
   - p95 por endpoint
   - Throughput
---

# 🧪 Etapas del Pipeline:

1. **Checkout SCM**: Obtiene el código del repositorio.s
2. **Creación contenedor**: Genera contenedor a partir de la imagen `jmeter-prom`.
3. **Health check de la aplicación**: Espera `/health`
4. **Ejecución de pruebas Jmeter**: Headless
5. **Publicación de reportes y gates de calidad**: Guarda los resusltados y los valida.
6. **Exposición de métricas**: Prometheus scrapea resultados.

## Referencias y documentación:

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Jenkins Pipeline Documentation](https://www.jenkins.io/doc/book/pipeline/)
- [JMeter User Manual](https://jmeter.apache.org/usermanual/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [JMeter Prometheus Plugin](https://github.com/johrstrom/jmeter-prometheus-plugin)
