import mongoose from 'mongoose';

const ErrorEntrySchema = new mongoose.Schema({
  type: String,
  message: String,
  stack: String,
  step: String,
}, { _id: false });

const GlobalErrorLogSchema = new mongoose.Schema({
  scrapeResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScrapeResult' },
  url: String,
  slug: String,
  errors: [ErrorEntrySchema],
  resolved: { type: Boolean, default: false },
  resolvedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.GlobalErrorLog || mongoose.model('GlobalErrorLog', GlobalErrorLogSchema);
