import mongoose from "mongoose";

const friendRequestSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      maxlength: 300,
    },
  },
  {
    timestamps: true,
  }
);

friendRequestSchema.pre("validate", function (next) {
  if (this.from && this.to && this.from.toString() === this.to.toString()) {
    return next(new Error("from and to must be different users"));
  }

  next();
});

friendRequestSchema.index({ from: 1, to: 1 }, { unique: true });

friendRequestSchema.index({ from: 1 });

friendRequestSchema.index({ to: 1 });

const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema);
export default FriendRequest;
