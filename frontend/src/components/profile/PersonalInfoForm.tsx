import { Heart } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { User } from "@/types/user";
import { useState } from "react";
import { toast } from "sonner";

type EditableField = {
  key: keyof Pick<User, "displayName" | "username" | "email" | "phone">;
  label: string;
  type?: string;
};

const PERSONAL_FIELDS: EditableField[] = [
  { key: "displayName", label: "Display name" },
  { key: "username", label: "Username" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone number" },
];

type Props = {
  userInfo: User | null;
};

const PersonalInfoForm = ({ userInfo }: Props) => {
  const [formData, setFormData] = useState({
    displayName: userInfo?.displayName ?? "",
    username: userInfo?.username ?? "",
    email: userInfo?.email ?? "",
    phone: userInfo?.phone ?? "",
    bio: userInfo?.bio ?? "",
  });

  const handleFieldChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      // Placeholder: profile update API integration can be added here.
      // await userService.updateProfile(formData);
      toast.success("Changes saved successfully!");
    } catch (error) {
      console.error("Error while saving:", error);
      toast.error("Failed to save changes");
    }
  };

  if (!userInfo) return null;

  return (
    <Card className="glass-strong border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="size-5 text-primary" />
          Personal information
        </CardTitle>
        <CardDescription>
          Update your personal details and profile information
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PERSONAL_FIELDS.map(({ key, label, type }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type={type ?? "text"}
                value={formData[key]}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                className="glass-light border-border/30"
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            rows={3}
            value={formData.bio}
            onChange={(e) => handleFieldChange("bio", e.target.value)}
            className="glass-light border-border/30 resize-none"
          />
        </div>

        <Button
          onClick={handleSave}
          className="w-full md:w-auto bg-gradient-primary hover:opacity-90 transition-opacity"
        >
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
};

export default PersonalInfoForm;
