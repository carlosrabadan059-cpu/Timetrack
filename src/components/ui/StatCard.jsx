import './StatCard.css';

/**
 * StatCard Component
 * Display statistics with icon, value and label
 * Based on Monitor.png design
 */
const StatCard = ({
    icon: Icon,
    iconColor = 'primary',
    value,
    label,
    subtitle,
    trend,
    className = '',
    onClick,
    ...props
}) => {
    const classes = [
        'stat-card',
        onClick ? 'cursor-pointer hover:bg-bg-secondary/80 transition-colors' : '',
        className
    ].filter(Boolean).join(' ');

    const iconClasses = [
        'stat-card-icon',
        `stat-card-icon-${iconColor}`
    ].join(' ');

    return (
        <div className={classes} onClick={onClick} {...props}>
            <div className="stat-card-header">
                {Icon && (
                    <div className={iconClasses}>
                        <Icon size={20} />
                    </div>
                )}
                {subtitle && <span className="stat-card-subtitle">{subtitle}</span>}
            </div>
            <div className="stat-card-value">{value}</div>
            <div className="stat-card-label">{label}</div>
            {trend && (
                <div className={`stat-card-trend ${trend.type}`}>
                    {trend.value}
                </div>
            )}
        </div>
    );
};

export default StatCard;
