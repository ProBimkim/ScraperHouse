import mongoose from 'mongoose';

const ChoiceSchema = new mongoose.Schema({
  text: String,
  isCorrect: Boolean,
  hasImage: Boolean,
  imageUrl: String,
}, { _id: false });

const QuestionSchema = new mongoose.Schema({
  id: String,
  title: String,
  type: String,
  imageUrl: String,
  choices: [ChoiceSchema],
  correctAnswer: String, // For fill-in-the-blank or other types
  explanation: String,
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

const ErrorLogSchema = new mongoose.Schema({
  message: String,
  stack: String,
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const QuizizzResultSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  inputType: { type: String, enum: ['url', 'joinCode'], required: true },
  inputValue: { type: String, required: true }, // The URL or Game PIN
  quizId: String,
  title: String,
  description: String,
  subject: String,
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

export default mongoose.models.QuizizzResult || mongoose.model('QuizizzResult', QuizizzResultSchema);
