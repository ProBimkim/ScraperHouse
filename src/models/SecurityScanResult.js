import mongoose from 'mongoose';

const VulnerabilityLocationSchema = new mongoose.Schema({
  file: { type: String, default: '' },
  startLine: { type: Number, default: null },
  endLine: { type: Number, default: null },
  snippet: { type: String, default: '' },
}, { _id: false });

const VulnerabilityItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  severity: { 
    type: String, 
    enum: ['critical', 'high', 'medium', 'low', 'info'], 
    default: 'medium' 
  },
  owaspCategory: { type: String, default: 'A01:2025 Broken Access Control' },
  cwe: { type: String, default: 'CWE-Unknown' },
  cve: { type: String, default: 'N/A' },
  cvss: { type: Number, default: 5.0 },
  cvssVector: { type: String, default: '' },
  confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'high' },
  fixEffort: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  endpoint: { type: String, default: '' },
  method: { type: String, default: 'GET' },
  target: { type: String, default: '' },
  description: { type: String, default: '' },
  impact: { type: String, default: '' },
  evidence: { type: String, default: '' },
  technicalAnalysis: { type: String, default: '' },
  pocDescription: { type: String, default: '' },
  pocScriptCode: { type: String, default: '' },
  codeLocations: [VulnerabilityLocationSchema],
  remediation: { type: String, default: '' },
  remediationPatch: { type: String, default: '' },
  references: [{ type: String }],
}, { _id: false });

const ProbedEndpointSchema = new mongoose.Schema({
  path: { type: String, required: true },
  status: { type: Number, default: 0 },
  accessible: { type: Boolean, default: false },
  title: { type: String, default: '' },
  note: { type: String, default: '' },
}, { _id: false });

const SecurityScanResultSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true },
  targetType: { 
    type: String, 
    enum: ['url', 'repo', 'code'], 
    required: true 
  },
  target: { type: String, required: true },
  targetLabel: { type: String, default: '' },
  scanMode: { 
    type: String, 
    enum: ['quick', 'standard', 'deep'], 
    default: 'standard' 
  },
  instruction: { type: String, default: '' },
  
  // Executive summary & scoring
  summary: {
    totalVulnerabilities: { type: Number, default: 0 },
    critical: { type: Number, default: 0 },
    high: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    low: { type: Number, default: 0 },
    info: { type: Number, default: 0 },
    riskScore: { type: Number, default: 0 }, // 0 - 100
    riskRating: { 
      type: String, 
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'SECURE'], 
      default: 'LOW' 
    },
  },
  executiveSummary: { type: String, default: '' },

  // Reconnaissance details
  recon: {
    server: { type: String, default: '' },
    statusCode: { type: Number, default: null },
    ipAddress: { type: String, default: '' },
    technologies: [{ type: String }],
    headers: { type: mongoose.Schema.Types.Mixed, default: {} },
    missingSecurityHeaders: [{ type: String }],
    probedEndpoints: [ProbedEndpointSchema],
    exposedRisks: [{ type: String }],
    envEndpoints: [{
      key: { type: String },
      value: { type: String },
      type: { type: String, default: 'ENDPOINT' },
      isSecret: { type: Boolean, default: false },
      source: { type: String, default: '.env' },
    }],
    adminEndpoints: [{
      path: { type: String },
      status: { type: Number, default: 0 },
      accessible: { type: Boolean, default: false },
      note: { type: String, default: '' },
    }],
    loginEndpoints: [{
      path: { type: String },
      status: { type: Number, default: 0 },
      accessible: { type: Boolean, default: false },
      method: { type: String, default: 'POST' },
      note: { type: String, default: '' },
      fields: [{ type: String }],
      hasCsrf: { type: Boolean, default: false },
      rateLimitDetected: { type: Boolean, default: false },
      fuzzResult: { type: String, default: 'SECURE' },
    }],
    repoMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },

  // Detailed findings
  vulnerabilities: [VulnerabilityItemSchema],

  // SARIF 2.1.0 output
  sarif: { type: mongoose.Schema.Types.Mixed, default: null },

  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing',
    index: true,
  },
  errorMessage: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.SecurityScanResult || 
  mongoose.model('SecurityScanResult', SecurityScanResultSchema);
