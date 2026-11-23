import type { Metadata } from "next";

export const defaultShareImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Kuyog Bohol car rental in Bohol",
};

export function publicMetadata(path: string, title: string, description: string, options: { absolute?: boolean; car?: boolean } = {}): Metadata {
  return {
    title: options.absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "Kuyog Bohol",
      locale: "en_PH",
      url: path,
      title,
      description,
      ...(options.car ? {} : { images: [defaultShareImage] }),
    },
  };
}
