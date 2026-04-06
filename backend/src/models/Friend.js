import mongoose from "mongoose";

const friendSchema = new mongoose.Schema(
  {
    userA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

friendSchema.pre("validate", function (next) {
  if (
    this.userA &&
    this.userB &&
    this.userA.toString() === this.userB.toString()
  ) {
    return next(new Error("userA and userB must be different users"));
  }

  next();
});

friendSchema.pre("save", function (next) {
  const a = this.userA.toString();
  const b = this.userB.toString();

  if (a > b) {
    this.userA = b;
    this.userB = a;
  }

  next();
});

friendSchema.index({ userA: 1, userB: 1 }, { unique: true });

const Friend = mongoose.model("Friend", friendSchema);

export default Friend;
