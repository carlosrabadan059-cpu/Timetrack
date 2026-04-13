import React from 'react';
import './Button.css';

const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    className = '',
    icon: Icon,
    ...props
}) => {
    // Collect all valid classes
    const classes = [
        'btn',
        variant && `btn-${variant}`,
        size && `btn-${size}`,
        fullWidth && 'btn-full',
        className
    ].filter(Boolean).join(' ');

    return (
        <button
            className={classes}
            {...props}
        >
            {Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 22 : 18} />}
            {children && <span className="btn-text">{children}</span>}
        </button>
    );
};

export default Button;
