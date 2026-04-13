import React, { useState } from 'react';
import { Camera, Check, Upload, ChevronRight } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

const SetupView = ({ onComplete }) => {
    const [step, setStep] = useState('upload'); // upload, validating, complete
    const [images, setImages] = useState([]);

    const handleUpload = () => {
        // Mock upload
        setImages(['mock_image.jpg']);
    };

    const handleProcess = () => {
        setStep('validating');
        // Mock processing delay
        setTimeout(() => {
            setStep('complete');
        }, 2000);
    };

    return (
        <div className="max-w-2xl mx-auto py-12">
            <div className="text-center mb-12">
                <h1 className="text-3xl font-bold text-white mb-4">Configura tu Entreno</h1>
                <p className="text-gray-400">Sube tu rutina o crea una nueva para empezar.</p>

                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-4 mt-8">
                    {['Subir', 'Validar', 'Listo'].map((label, idx) => {
                        const currentIdx = ['upload', 'validating', 'complete'].indexOf(step);
                        const status = idx < currentIdx ? 'done' : idx === currentIdx ? 'active' : 'pending';

                        return (
                            <div key={label} className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${status === 'done' ? 'bg-success text-white' :
                                        status === 'active' ? 'bg-primary text-white scale-110' :
                                            'bg-surface-elevated text-gray-500'
                                    }`}>
                                    {status === 'done' ? <Check className="w-4 h-4" /> : idx + 1}
                                </div>
                                <span className={`text-sm ${status === 'active' ? 'text-white font-medium' : 'text-gray-500'}`}>{label}</span>
                                {idx < 2 && <div className="w-8 h-px bg-white/10" />}
                            </div>
                        );
                    })}
                </div>
            </div>

            <Card className="min-h-[400px] flex flex-col items-center justify-center p-8 border-dashed border-2 border-white/10 hover:border-primary/50 transition-colors">
                {step === 'upload' && (
                    <div className="text-center space-y-6 animate-fade-in">
                        <div className="w-20 h-20 rounded-full bg-surface-elevated flex items-center justify-center mx-auto mb-4">
                            <Upload className="w-10 h-10 text-gray-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white mb-2">Sube fotos de tu rutina</h3>
                            <p className="text-gray-400 max-w-sm mx-auto">
                                Arrastra archivos aquí o haz clic para usar la cámara. La IA detectará los ejercicios automáticamente.
                            </p>
                        </div>

                        {images.length > 0 ? (
                            <Button onClick={handleProcess} className="w-full">
                                Procesar {images.length} Imagen(es)
                            </Button>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <Button onClick={handleUpload} variant="secondary">
                                    <Camera className="w-5 h-5" />
                                    Tomar Foto
                                </Button>
                                <p className="text-xs text-gray-500">Soporta JPG, PNG, PDF</p>
                            </div>
                        )}
                    </div>
                )}

                {step === 'validating' && (
                    <div className="text-center space-y-6 animate-fade-in">
                        <div className="relative w-20 h-20 mx-auto">
                            <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <h3 className="text-xl font-bold text-white">Analizando Rutina...</h3>
                        <p className="text-gray-400">Identificando ejercicios, series y repeticiones.</p>
                    </div>
                )}

                {step === 'complete' && (
                    <div className="text-center space-y-6 animate-fade-in">
                        <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto text-success">
                            <Check className="w-10 h-10" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white mb-2">¡Todo listo!</h3>
                            <p className="text-gray-400">Hemos configurado tu plan de entrenamiento de 4 días.</p>
                        </div>
                        <Button onClick={onComplete} variant="success" className="w-full">
                            Ir al Dashboard <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default SetupView;
