import React from 'react';

const Badge = ({ children, variant = 'default', className = '' }) => {
    const variants = {
        default: "bg-white/5 text-gray-300",
        primary: "bg-primary/20 text-blue-300 border border-primary/20",
        success: "bg-success/20 text-green-300 border border-success/20",
        active: "bg-active/20 text-lime-300 border border-active/20"
    };

    return (
        <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wide ${variants[variant]} ${className}`}>
            {children}
        </span>
    );
};

export default Badge;
