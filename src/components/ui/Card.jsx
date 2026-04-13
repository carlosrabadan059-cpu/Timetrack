import React from 'react';
import './Card.css';

const Card = ({ children, className = '', padding = 'md', ...props }) => {
    // Determine internal padding class based on prop
    const paddingClass = padding === 'none' ? 'card-padding-none' :
        padding === 'sm' ? 'card-padding-sm' :
            padding === 'lg' ? 'card-padding-lg' :
                'card-padding-md';

    return (
        <div
            className={`card ${paddingClass} ${className}`}
            {...props}
        >
            {children}
        </div>
    );
};

export default Card;
