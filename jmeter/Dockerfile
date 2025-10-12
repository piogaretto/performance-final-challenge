FROM alpine:3.18

# Install OpenJDK and other dependencies
RUN apk add --no-cache openjdk11-jre-headless curl bash

# Download and install JMeter
ENV JMETER_VERSION=5.6.3
ENV JMETER_HOME=/opt/apache-jmeter-${JMETER_VERSION}
ENV JMETER_BIN=${JMETER_HOME}/bin
ENV PATH=$PATH:${JMETER_BIN}

RUN mkdir -p /tmp/dependencies \
    && curl -L --silent https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz > /tmp/dependencies/apache-jmeter-${JMETER_VERSION}.tgz \
    && mkdir -p /opt \
    && tar -xzf /tmp/dependencies/apache-jmeter-${JMETER_VERSION}.tgz -C /opt \
    && rm -rf /tmp/dependencies

# For educational purposes, we'll create a simple JMeter setup
# In production, you would add the Prometheus listener JAR here
# COPY jmeter-prometheus-listener.jar ${JMETER_HOME}/lib/ext/jmeter-prometheus-listener.jar

# Expose the Prometheus scrape port used by the listener
EXPOSE 9270

WORKDIR ${JMETER_HOME}
ENTRYPOINT ["jmeter"]