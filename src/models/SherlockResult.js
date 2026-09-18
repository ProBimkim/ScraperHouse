import mongoose from 'mongoose';

const ResultItemSchema = new mongoose.Schema({
  siteName: { type: String, required: true },
  url: { type: String, required: true },
  status: { type: String, enum: ['found', 'not_found', 'error'], required: true },
  httpStatus: Number,
  responseTime: Number,
  errorMsg: String,
}, { _id: false });

const SherlockResultSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  username: { type: String, required: true, index: true },
  totalSites: { type: Number, default: 0 },
  foundCount: { type: Number, default: 0 },
  notFoundCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  mode: { type: String, default: 'all' },
  results: [ResultItemSchema],
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing',
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.SherlockResult || mongoose.model('SherlockResult', SherlockResultSchema);
