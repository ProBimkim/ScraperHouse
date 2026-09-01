import mongoose from 'mongoose';

const QuestionSchema = new mongoose.Schema({
  id: String,
  title: String,
  type: String,
  required: Boolean,
  choices: [mongoose.Schema.Types.Mixed],
  imageUrl: String,
  originalImageUrl: String,
}, { _id: false });

const ErrorLogSchema = new mongoose.Schema({
  message: String,
  stack: String,
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const StepSchema = new mongoose.Schema({
  step: String,
  status: String,
  url: String,
  apiUrl: String,
  message: String,
  stack: String,
  httpStatus: Number,
  length: Number,
}, { _id: false, strict: false });

const ScrapeResultSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  apiUrl: String,
  title: String,
  description: String,
  jumlah_pertanyaan: { type: Number, default: 0 },
  questions: [QuestionSchema],
  rawApiResponse: { type: mongoose.Schema.Types.Mixed },
  errors: [ErrorLogSchema],
  scrapeSteps: [StepSchema],
  status: {
    type: String,
    enum: ['processing', 'success', 'partial', 'failed'],
    default: 'processing',
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.ScrapeResult || mongoose.model('ScrapeResult', ScrapeResultSchema);
