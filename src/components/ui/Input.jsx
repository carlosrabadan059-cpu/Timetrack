import React from 'react';
import './Input.css';

const Input = ({
    label,
    error,
    hint,
    icon: Icon,
    className = '',
    wrapperClassName = '',
    fullWidth = true,
    ...props
}) => {
    return (
        <div className={`input-wrapper ${fullWidth ? 'input-full' : ''} ${error ? 'input-error' : ''} ${wrapperClassName}`}>
            {label && <label className="input-label">{label}</label>}

            <div className={`input-container ${Icon ? 'input-with-icon' : ''}`}>
                {Icon && (
                    <div className="input-icon">
                        <Icon size={18} />
                    </div>
                )}
                <input
                    className={`input-field ${className}`}
                    {...props}
                />
            </div>

            {error && <span className="input-error-message">{error}</span>}
            {hint && !error && <span className="input-hint">{hint}</span>}
        </div>
    );
};

export default Input;
