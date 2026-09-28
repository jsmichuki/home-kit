"use client";

import { useEffect, useRef, useState } from "react";

type TaglineRevealProps = {
  children: string;
};

export function TaglineReveal({ children }: TaglineRevealProps) {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLParagraphElement>(null);
  const words = children.split(" ");

  useEffect(() => {
    const section = sectionRef.current;

    if (!section) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.5 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <p
      className={`display-font text-balance text-4xl leading-tight sm:text-5xl ${isVisible ? "tagline-revealed" : ""}`}
      ref={sectionRef}
    >
      {words.map((word, index) => (
        <span className="reveal-word" key={`${word}-${index}`} style={{ transitionDelay: `${index * 65}ms` }}>
          {word}{" "}
        </span>
      ))}
    </p>
  );
}
