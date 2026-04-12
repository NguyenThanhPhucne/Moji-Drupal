import api from "@/lib/axios";

export type SafetyReportTargetType = "message" | "post" | "comment";

export const safetyService = {
  async createReport(payload: {
    targetType: SafetyReportTargetType;
    targetId: string;
    reason?: string;
    details?: string;
  }) {
    const res = await api.post("/safety/reports", payload);
    return res.data;
  },
};
