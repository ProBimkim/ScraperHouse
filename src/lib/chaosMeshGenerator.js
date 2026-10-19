/**
 * Kubernetes Chaos Mesh & Distributed k6 Resilience Suite Generator
 * (Client-safe pure generator without Node.js backend dependencies)
 *
 * Generates:
 * 1. Target Application Setup (01-target-app.yaml)
 * 2. Advance k6 Stress Script (02-k6-script.js)
 * 3. k6 Distributed Runner CR (03-k6-operator-cr.yaml)
 * 4. Orchestration Chaos Mesh Master Workflow (04-chaos-workflow-master.yaml)
 * 5. Prometheus Safety Alert Rule (05-prometheus-abort-rule.yaml)
 * 6. Step-by-Step CLI Execution Guide
 */
export function generateChaosMeshSuite(customOptions = {}) {
  const rawTarget = customOptions.targetUrl || '';
  let normalizedTarget = (typeof rawTarget === 'string' ? rawTarget.trim() : '');
  if (normalizedTarget && !/^https?:\/\//i.test(normalizedTarget)) {
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|[\w-]+-svc|[\w-]+\.svc|[\w-]+-service)/i.test(normalizedTarget)) {
      normalizedTarget = 'http://' + normalizedTarget;
    } else {
      normalizedTarget = 'https://' + normalizedTarget;
    }
  }
  if (!normalizedTarget) {
    normalizedTarget = `http://${customOptions.backendServiceName || 'backend-service'}.${customOptions.namespace || 'dev'}.svc.cluster.local/`;
  }

  const opts = {
    namespace: customOptions.namespace || 'dev',
    backendAppName: customOptions.backendAppName || 'backend-api',
    databaseAppName: customOptions.databaseAppName || 'database',
    databaseServiceName: customOptions.databaseServiceName || 'database-svc',
    backendServiceName: customOptions.backendServiceName || 'backend-service',
    backendReplicas: Number(customOptions.backendReplicas) || 4,
    backendCpuRequest: customOptions.backendCpuRequest || '100m',
    backendCpuLimit: customOptions.backendCpuLimit || '500m',
    backendMemoryRequest: customOptions.backendMemoryRequest || '128Mi',
    backendMemoryLimit: customOptions.backendMemoryLimit || '256Mi',
    k6Parallelism: Number(customOptions.k6Parallelism) || 4,
    targetUrl: normalizedTarget,
    startRateRps: Number(customOptions.startRateRps) || 50,
    warmupTargetRps: Number(customOptions.warmupTargetRps) || 200,
    peakTargetRps: Number(customOptions.peakTargetRps) || 1000,
    networkLatency: customOptions.networkLatency || '150ms',
    networkJitter: customOptions.networkJitter || '30ms',
    networkLoss: customOptions.networkLoss || '5',
    cpuStressLoad: Number(customOptions.cpuStressLoad) || 90,
    memoryStressSize: customOptions.memoryStressSize || '200Mi',
    podKillCron: customOptions.podKillCron || '*/30 * * * * *',
    abort5xxRatePercent: Number(customOptions.abort5xxRatePercent) || 30,
    abortDurationSeconds: customOptions.abortDurationSeconds || '15s',
  };

  const targetAppYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: ${opts.namespace}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${opts.databaseAppName}
  namespace: ${opts.namespace}
  labels:
    app: ${opts.databaseAppName}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${opts.databaseAppName}
  template:
    metadata:
      labels:
        app: ${opts.databaseAppName}
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: ${opts.databaseServiceName}
  namespace: ${opts.namespace}
  labels:
    app: ${opts.databaseAppName}
spec:
  selector:
    app: ${opts.databaseAppName}
  ports:
  - port: 6379
    targetPort: 6379
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${opts.backendAppName}
  namespace: ${opts.namespace}
  labels:
    app: ${opts.backendAppName}
spec:
  replicas: ${opts.backendReplicas}
  selector:
    matchLabels:
      app: ${opts.backendAppName}
  template:
    metadata:
      labels:
        app: ${opts.backendAppName}
    spec:
      containers:
      - name: api
        image: nginx:alpine
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: "${opts.backendCpuRequest}"
            memory: "${opts.backendMemoryRequest}"
          limits:
            cpu: "${opts.backendCpuLimit}"
            memory: "${opts.backendMemoryLimit}"
---
apiVersion: v1
kind: Service
metadata:
  name: ${opts.backendServiceName}
  namespace: ${opts.namespace}
spec:
  type: ClusterIP
  selector:
    app: ${opts.backendAppName}
  ports:
  - port: 80
    targetPort: 80
`;

  const k6ScriptJs = `import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom Metrics
const TransactionErrors = new Counter('custom_transaction_errors');
const DbLatency = new Trend('custom_db_latency');

export const options = {
  scenarios: {
    stress_test: {
      executor: 'ramping-arrival-rate',
      startRate: ${opts.startRateRps},
      timeUnit: '1s',
      preAllocatedVUs: ${Math.max(Math.round(Number(opts.peakTargetRps || 1000) * 0.2), 100)},
      maxVUs: ${Math.max(Number(opts.peakTargetRps || 1000) * 3, 5000)},
      stages: [
        { duration: '1m', target: ${opts.warmupTargetRps} },  // Warm-up
        { duration: '3m', target: ${opts.peakTargetRps} }, // Peak Stress Load (${opts.peakTargetRps} RPS)
        { duration: '1m', target: 0 },    // Cool-down
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],      // Maksimal error 2%
    http_req_duration: ['p(95)<300'],    // 95% request wajib di bawah 300ms
    'http_req_duration{scenario:stress_test}': ['p(99)<800'],
  },
};

export default function () {
  const url = '${opts.targetUrl}';
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-distributed-runner',
    },
    timeout: '2s',
  };

  const res = http.get(url, params);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!success) {
    TransactionErrors.add(1);
  }

  DbLatency.add(res.timings.waiting);
  sleep(0.01);
}
`;

  const k6OperatorCrYaml = `apiVersion: k6.io/v1alpha1
kind: K6
metadata:
  name: k6-distributed-test
  namespace: ${opts.namespace}
spec:
  parallelism: ${opts.k6Parallelism}
  script:
    configMap:
      name: k6-test-script
      file: k6-script.js
  arguments: --tag test_id=chaos_combined_01
  runner:
    image: grafana/k6:0.49.0
    resources:
      limits:
        cpu: "1"
        memory: "500Mi"
      requests:
        cpu: "500m"
        memory: "256Mi"
`;

  const chaosWorkflowYaml = `apiVersion: chaos-mesh.org/v1alpha1
kind: Workflow
metadata:
  name: full-resilience-testing
  namespace: ${opts.namespace}
spec:
  entry: entry-node
  templates:
    # 1. Main Entry Point
    - name: entry-node
      templateType: Serial
      children:
        - wait-for-k6-ramp-up
        - inject-parallel-chaos
        - cooldown-period

    # 2. Delay 1 Menit agar k6 masuk ke Peak Load
    - name: wait-for-k6-ramp-up
      templateType: Suspend
      suspend:
        duration: '1m'

    # 3. Injeksi Gangguan Gabungan (Parallel)
    - name: inject-parallel-chaos
      templateType: Parallel
      children:
        - network-degradation
        - cpu-ram-stress
        - random-pod-killer

    # 4. Network Chaos: Delay + Packet Loss ke Database
    - name: network-degradation
      templateType: NetworkChaos
      deadline: '2m'
      networkChaos:
        action: delay
        mode: all
        selector:
          namespaces: ['${opts.namespace}']
          labelSelectors: {'app': '${opts.backendAppName}'}
        delay:
          latency: '${opts.networkLatency}'
          jitter: '${opts.networkJitter}'
          correlation: '50'
        loss:
          loss: '${opts.networkLoss}'
        direction: to
        target:
          selector:
            namespaces: ['${opts.namespace}']
            labelSelectors: {'app': '${opts.databaseAppName}'}

    # 5. Stress Chaos: Habiskan CPU & Memory Backend
    - name: cpu-ram-stress
      templateType: StressChaos
      deadline: '1m30s'
      stressChaos:
        mode: fixed
        value: '2' # Target 2 pod backend
        selector:
          namespaces: ['${opts.namespace}']
          labelSelectors: {'app': '${opts.backendAppName}'}
        stressors:
          cpu:
            workers: 2
            load: ${opts.cpuStressLoad} # ${opts.cpuStressLoad}% CPU Load per worker
          memory:
            workers: 1
            size: '${opts.memoryStressSize}'

    # 6. Pod Chaos: Matikan Pod Backend Secara Acak (Pod Kill)
    - name: random-pod-killer
      templateType: PodChaos
      deadline: '2m'
      podChaos:
        action: pod-kill
        mode: one
        selector:
          namespaces: ['${opts.namespace}']
          labelSelectors: {'app': '${opts.backendAppName}'}
        scheduler:
          cron: '${opts.podKillCron}' # Kill 1 pod secara berkala

    # 7. Waktu Pemulihan (Recovery)
    - name: cooldown-period
      templateType: Suspend
      suspend:
        duration: '30s'
`;

  const prometheusAbortRuleYaml = `apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: chaos-abort-rule
  namespace: ${opts.namespace}
  labels:
    role: alert-rules
spec:
  groups:
  - name: chaos.safety.rules
    rules:
    - alert: EmergencyChaosAbort
      expr: |
        (
          sum(rate(k6_http_reqs{status=~"5.."}[30s])) 
          / 
          sum(rate(k6_http_reqs[30s]))
        ) * 100 > ${opts.abort5xxRatePercent}
      for: ${opts.abortDurationSeconds}
      labels:
        severity: critical
      annotations:
        summary: "Error rate melampaui ${opts.abort5xxRatePercent}% selama ${opts.abortDurationSeconds}! Hentikan Chaos Mesh."
`;

  const cliSteps = [
    {
      step: 1,
      title: 'Persiapan Environment Target (Deploy Backend & Redis)',
      description: 'Terapkan manifest aplikasi backend 4 replika dan service database redis di namespace dev.',
      filename: '01-target-app.yaml',
      command: `kubectl apply -f 01-target-app.yaml\nkubectl get pods -n ${opts.namespace} -w`,
    },
    {
      step: 2,
      title: 'Deploy Script k6 ke ConfigMap',
      description: 'Simpan skrip advance k6 ke dalam Kubernetes ConfigMap agar dapat diakses runner pod.',
      filename: '02-k6-script.js',
      command: `kubectl create configmap k6-test-script --from-file=k6-script.js=02-k6-script.js -n ${opts.namespace}`,
    },
    {
      step: 3,
      title: 'Jalankan Distributed Load Test (k6 Operator)',
      description: `Inisialisasi ${opts.k6Parallelism} Pod runner k6 secara paralel untuk mencapai beban ${opts.peakTargetRps} RPS.`,
      filename: '03-k6-operator-cr.yaml',
      command: `kubectl apply -f 03-k6-operator-cr.yaml\nkubectl get pods -n ${opts.namespace} -l k6cr=k6-distributed-test`,
    },
    {
      step: 4,
      title: 'Trigger Orchestration Chaos Mesh Workflow',
      description: 'Jalankan injeksi bertahap & paralel (Network degradation, CPU/RAM stress, Pod killer) saat k6 peak load.',
      filename: '04-chaos-workflow-master.yaml',
      command: `kubectl apply -f 04-chaos-workflow-master.yaml\nkubectl get workflow full-resilience-testing -n ${opts.namespace} -o wide`,
    },
    {
      step: 5,
      title: 'Monitoring & Troubleshooting Real-Time',
      description: 'Amati log k6 runner, injeksi aktif Chaos Mesh, dan status pod backend secara real-time.',
      command: `kubectl logs -n ${opts.namespace} -l k6cr=k6-distributed-test --tail=100 -f\nkubectl get networkchaos,stresschaos,podchaos -n ${opts.namespace}\nkubectl describe pod -l app=${opts.backendAppName} -n ${opts.namespace}`,
    },
    {
      step: 6,
      title: 'Safety Net Abort & Pembersihan (Cleanup)',
      description: 'Hentikan pengujian, bersihkan resource eksperimen dan kembalikan cluster ke kondisi normal.',
      command: `kubectl delete -f 04-chaos-workflow-master.yaml -n ${opts.namespace}\nkubectl delete -f 03-k6-operator-cr.yaml -n ${opts.namespace}\nkubectl delete configmap k6-test-script -n ${opts.namespace}`,
    },
  ];

  const fullBundleCombinedYaml = `# ========================================================
# KUBERNETES CHAOS & DISTRIBUTED LOAD TESTING SUITE
# Generated by Strix AI Pentesting & Stress Engine
# ========================================================

# --- 1. TARGET APP SETUP (01-target-app.yaml) ---
${targetAppYaml}
---
# --- 3. K6 DISTRIBUTED RUNNER CR (03-k6-operator-cr.yaml) ---
${k6OperatorCrYaml}
---
# --- 4. CHAOS MESH WORKFLOW MASTER (04-chaos-workflow-master.yaml) ---
${chaosWorkflowYaml}
---
# --- 5. PROMETHEUS EMERGENCY ABORT RULE (05-prometheus-abort-rule.yaml) ---
${prometheusAbortRuleYaml}
`;

  return {
    options: opts,
    files: {
      '01-target-app.yaml': targetAppYaml,
      '02-k6-script.js': k6ScriptJs,
      '03-k6-operator-cr.yaml': k6OperatorCrYaml,
      '04-chaos-workflow-master.yaml': chaosWorkflowYaml,
      '05-prometheus-abort-rule.yaml': prometheusAbortRuleYaml,
      'full-bundle-k8s.yaml': fullBundleCombinedYaml,
    },
    cliSteps,
  };
}
