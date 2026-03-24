export default function Loading() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-[#0a0a1a]">
      <div className="relative h-8 w-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-0 h-full w-full"
            style={{
              transform: `rotate(${i * 30}deg)`,
              animation: `macos-fade 1.2s ${(i * 0.1).toFixed(1)}s infinite linear`,
              opacity: 0,
            }}
          >
            <div className="mx-auto h-[26%] w-[8%] rounded-full bg-gray-400 dark:bg-white/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
