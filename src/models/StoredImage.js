import mongoose from 'mongoose';

const StoredImageSchema = new mongoose.Schema({
  slug: { type: String, required: true, index: true },
  imageKey: { type: String, required: true, index: true }, // e.g. "q_0", "q_0_opt_1"
  contentType: { type: String, default: 'image/jpeg' },
  data: { type: Buffer, required: true },
  size: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

// Compound index to ensure uniqueness for slug + imageKey
StoredImageSchema.index({ slug: 1, imageKey: 1 }, { unique: true });

export default mongoose.models.StoredImage || mongoose.model('StoredImage', StoredImageSchema);
