import {
  appleIconContentType,
  appleIconSize,
  renderAppleIcon,
} from "@/lib/branding/og";

export const size = appleIconSize;
export const contentType = appleIconContentType;

export default function AppleIcon() {
  return renderAppleIcon();
}
