import { v2 as cloudinary } from "cloudinary";

export const extractPublicIdFromUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  try {
    // Tách các thành phần của link URL Cloudinary chuẩn: 
    // https://res.cloudinary.com/<cloud_name>/image/upload/v1234567890/folder/subfolder/public_id.ext
    const parts = url.split("/");
    const uploadIndex = parts.indexOf("upload");
    
    if (uploadIndex === -1) return null;

    // Bỏ qua thư mục upload và version tag (vd: v1712...)
    let idStartIndex = uploadIndex + 1;
    if (parts[idStartIndex] && parts[idStartIndex].startsWith("v")) {
      idStartIndex++;
    }

    const publicIdWithExtension = parts.slice(idStartIndex).join("/");
    
    // Loại bỏ đuôi mở rộng (.jpg, .png...)
    const lastDotIndex = publicIdWithExtension.lastIndexOf(".");
    if (lastDotIndex === -1) return publicIdWithExtension;
    
    return publicIdWithExtension.substring(0, lastDotIndex);
  } catch (error) {
    console.error(`[cloudinaryHelper] Lỗi trích xuất public_id từ url: ${url}`, error);
    return null;
  }
};

export const destroyImageFromUrl = async (url) => {
  const publicId = extractPublicIdFromUrl(url);
  if (!publicId) return false;

  try {
    const response = await cloudinary.uploader.destroy(publicId);
    return response.result === "ok";
  } catch (error) {
    console.error(`[cloudinaryHelper] Lỗi khi huỷ ảnh trên Cloudinary ID: ${publicId}`, error);
    return false;
  }
};
