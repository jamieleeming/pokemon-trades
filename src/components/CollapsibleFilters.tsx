import React, { useState, useEffect } from 'react';

interface CollapsibleFiltersProps {
  children: React.ReactNode;
  title?: string;
}

const CollapsibleFilters: React.FC<CollapsibleFiltersProps> = ({ 
  children, 
  title = "Filters" 
}) => {
  // Default to collapsed state initially
  const [isExpanded, setIsExpanded] = useState(false);

  // Initialize the expanded state based on screen size
  useEffect(() => {
    // Set initial state based on screen width
    setIsExpanded(window.innerWidth >= 768);
    
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      
      // Only auto-expand when transitioning from mobile to desktop
      if (!isMobile) {
        setIsExpanded(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []); // Empty dependency array - only run on mount

  const toggleExpanded = () => {
    setIsExpanded(prev => !prev);
  };

  return (
    <div className="mb-6 rounded-lg bg-white shadow-md">
      <div 
        className="flex items-center justify-between cursor-pointer h-14 px-4"
        onClick={toggleExpanded}
      >
        <h2 className="text-xl font-semibold">{title}</h2>
        <button 
          className="text-gray-500 hover:text-gray-700 focus:outline-none md:hidden flex items-center justify-center h-8 w-8"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse filters" : "Expand filters"}
        >
          {isExpanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>
      
      {/* Filter content - collapsible on mobile */}
      <div 
        className={`px-4 pb-4 transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 md:max-h-96 md:opacity-100'
        }`}
      >
        {children}
      </div>
    </div>
  );
};

export default CollapsibleFilters; 