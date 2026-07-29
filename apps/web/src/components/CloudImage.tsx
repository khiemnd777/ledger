import { downloadCloudImage } from "@pocket/firebase";
import type { ImgHTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";

interface CloudImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> {
  ownerUid?: string;
  path?: string;
  fallback?: ReactNode;
  alt: string;
}

export function CloudImage({ ownerUid, path, fallback = null, alt, ...props }: CloudImageProps) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setUrl("");
    if (!ownerUid || !path) return;
    void downloadCloudImage(ownerUid, path)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setUrl("");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ownerUid, path]);

  return url ? <img src={url} alt={alt} {...props} /> : fallback;
}
