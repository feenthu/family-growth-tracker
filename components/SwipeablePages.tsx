import React, { useState } from 'react';
import { motion, PanInfo, useMotionValue, useTransform } from 'framer-motion';

interface SwipeablePagesProps {
  pages: React.ReactNode[];
  initialPage?: number;
}

export const SwipeablePages: React.FC<SwipeablePagesProps> = ({ pages, initialPage = 0 }) => {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const x = useMotionValue(0);
  const background = useTransform(
    x,
    [-200, 0, 200],
    ['rgba(99, 102, 241, 0.1)', 'rgba(255, 255, 255, 0)', 'rgba(99, 102, 241, 0.1)']
  );

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100;
    const velocity = info.velocity.x;
    const offset = info.offset.x;

    // Swipe left (next page)
    if (offset < -threshold || velocity < -500) {
      if (currentPage < pages.length - 1) {
        setCurrentPage(currentPage + 1);
      }
    }
    // Swipe right (previous page)
    else if (offset > threshold || velocity > 500) {
      if (currentPage > 0) {
        setCurrentPage(currentPage - 1);
      }
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Page Indicators */}
      <div className="flex justify-center gap-2 mb-6">
        {pages.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentPage(index)}
            className={`w-2 h-2 rounded-full transition-all ${
              index === currentPage
                ? 'bg-indigo-600 w-8'
                : 'bg-slate-300 dark:bg-slate-600'
            }`}
            aria-label={`Go to page ${index + 1}`}
          />
        ))}
      </div>

      {/* Navigation Arrows */}
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            currentPage === 0
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          ← Previous
        </button>

        <span className="text-sm text-slate-600 dark:text-slate-400">
          Page {currentPage + 1} of {pages.length}
        </span>

        <button
          onClick={() => setCurrentPage(Math.min(pages.length - 1, currentPage + 1))}
          disabled={currentPage === pages.length - 1}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            currentPage === pages.length - 1
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          Next →
        </button>
      </div>

      {/* Swipeable Content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        style={{ x, background }}
        className="relative rounded-xl"
      >
        <motion.div
          key={currentPage}
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -100 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {pages[currentPage]}
        </motion.div>
      </motion.div>

      {/* Swipe Hint */}
      <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
        Swipe or use arrows to navigate between pages
      </div>
    </div>
  );
};