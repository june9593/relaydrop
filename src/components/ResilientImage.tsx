import { useEffect, useMemo, useState, type ImgHTMLAttributes, type ReactNode } from "react";

interface ResilientImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> {
  sources: Array<string | undefined>;
  fallback: ReactNode;
}

export function ResilientImage({
  sources,
  fallback,
  ...imageProps
}: ResilientImageProps) {
  const candidates = useMemo(
    () => [...new Set(sources.filter((source): source is string => Boolean(source)))],
    [sources.join("\u0000")]
  );
  const candidateKey = candidates.join("\u0000");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [readySource, setReadySource] = useState<string>();

  useEffect(() => {
    setCandidateIndex(0);
    setReadySource(undefined);
  }, [candidateKey]);

  useEffect(() => {
    const source = candidates[candidateIndex];
    setReadySource(undefined);
    if (!source) {
      return;
    }

    let active = true;
    const probe = new Image();
    probe.onload = () => {
      if (active) setReadySource(source);
    };
    probe.onerror = () => {
      if (active) setCandidateIndex((current) => current + 1);
    };
    probe.src = source;

    return () => {
      active = false;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [candidateIndex, candidateKey]);

  if (!readySource) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...imageProps}
      src={readySource}
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
}
