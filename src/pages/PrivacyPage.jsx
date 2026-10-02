import { Link, useNavigate } from 'react-router-dom';
import { Clock, ArrowLeft } from 'lucide-react';
import './PrivacyPage.css';

const LAST_UPDATED = '2 de octubre de 2026';

const PrivacyPage = () => {
    const navigate = useNavigate();

    return (
        <div className="privacy-page">
            <article className="privacy-content">
                <header className="privacy-header">
                    <div className="privacy-logo">
                        <Clock size={28} />
                        <span>TimeTrack</span>
                    </div>
                    <button type="button" className="privacy-back" onClick={() => navigate(-1)}>
                        <ArrowLeft size={16} /> Volver
                    </button>
                </header>

                <h1>Política de privacidad</h1>
                <p className="privacy-updated">Última actualización: {LAST_UPDATED}</p>

                <p>
                    Esta página explica cómo se tratan tus datos personales cuando usas TimeTrack para
                    registrar tu jornada laboral, conforme al Reglamento (UE) 2016/679 (RGPD) y a la
                    Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos
                    digitales (LOPDGDD).
                </p>

                <h2>1. Quién es el responsable</h2>
                <p>
                    El <strong>responsable del tratamiento</strong> es la empresa para la que trabajas, que
                    usa TimeTrack para cumplir sus obligaciones como empleadora. Encontrarás sus datos de
                    contacto y, en su caso, los de su Delegado de Protección de Datos en la información que
                    te haya dado tu empresa o en el departamento de Recursos Humanos.
                </p>
                <p>
                    El proveedor de TimeTrack actúa como <strong>encargado del tratamiento</strong>: trata
                    los datos solo por cuenta de tu empresa y siguiendo sus instrucciones (art. 28 RGPD).
                </p>

                <h2>2. Qué datos tratamos, para qué y con qué base jurídica</h2>
                <div className="privacy-table-wrap">
                    <table className="privacy-table">
                        <thead>
                            <tr>
                                <th>Datos</th>
                                <th>Finalidad</th>
                                <th>Base jurídica</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Nombre, email, código de empleado, rol</td>
                                <td>Identificarte y darte acceso a la aplicación</td>
                                <td>Ejecución del contrato de trabajo (art. 6.1.b RGPD)</td>
                            </tr>
                            <tr>
                                <td>Fichajes: fecha, hora, entrada/salida, pausas, origen (web, móvil, lector)</td>
                                <td>Registro diario de jornada</td>
                                <td>Obligación legal (art. 6.1.c RGPD; art. 34.9 del Estatuto de los Trabajadores)</td>
                            </tr>
                            <tr>
                                <td>Ubicación GPS en el momento de fichar (web y móvil)</td>
                                <td>Comprobar que el fichaje se hace desde el centro de trabajo</td>
                                <td>Interés legítimo en el control laboral (art. 6.1.f RGPD; art. 20.3 ET; art. 90 LOPDGDD)</td>
                            </tr>
                            <tr>
                                <td>Credenciales de acceso físico: tarjeta, PIN, eventos del lector</td>
                                <td>Control de acceso a las instalaciones</td>
                                <td>Ejecución del contrato e interés legítimo en la seguridad (art. 6.1.b y 6.1.f RGPD)</td>
                            </tr>
                            <tr>
                                <td>Incidencias, correcciones y vacaciones</td>
                                <td>Gestionar tus solicitudes y corregir el registro</td>
                                <td>Ejecución del contrato (art. 6.1.b RGPD)</td>
                            </tr>
                            <tr>
                                <td>Datos técnicos: tipo de dispositivo, sesión</td>
                                <td>Seguridad de la cuenta y funcionamiento del servicio</td>
                                <td>Interés legítimo (art. 6.1.f RGPD)</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h2>3. Geolocalización</h2>
                <p>
                    La ubicación se captura <strong>solo en el momento de fichar</strong> desde la web o la
                    app móvil, nunca de forma continua ni fuera de ese instante. Antes de guardarla por
                    primera vez se te muestra un aviso informativo, y puedes fichar sin compartir tu
                    ubicación. Los fichajes con el lector físico no usan GPS.
                </p>

                <h2>4. Cuánto tiempo se conservan</h2>
                <ul>
                    <li>
                        <strong>Registro de jornada</strong> (fichajes, correcciones e incidencias): 4 años desde
                        cada registro, como exige el art. 34.9 del Estatuto de los Trabajadores. Después se borra
                        automáticamente.
                    </li>
                    <li>
                        <strong>Coordenadas GPS:</strong> el plazo que fije tu empresa (30 días por defecto) y, en
                        todo caso, se borran cuando dejas la empresa. Después solo se conserva si el fichaje se hizo
                        dentro o fuera de la sede.
                    </li>
                    <li>
                        <strong>Datos de tu cuenta y vacaciones:</strong> mientras dure la relación laboral. Al dejar
                        la empresa se bloquean: se conservan sin uso, solo para atender obligaciones legales o
                        reclamaciones (art. 32 LOPDGDD), y se borran cuando ya no queda ningún registro tuyo dentro
                        del plazo de 4 años.
                    </li>
                    <li>
                        <strong>Credenciales de acceso físico</strong> (tarjeta, PIN): se eliminan al dejar la empresa.
                    </li>
                </ul>

                <h2>5. Quién puede acceder a tus datos</h2>
                <ul>
                    <li>Tú, desde la propia aplicación (historial, informes y exportación).</li>
                    <li>Los responsables de RR. HH. y los mandos autorizados de tu empresa.</li>
                    <li>
                        La Inspección de Trabajo y los representantes legales de los trabajadores, respecto
                        del registro de jornada, cuando la ley lo prevé.
                    </li>
                    <li>
                        Proveedores técnicos que prestan servicios al encargado (alojamiento, base de datos,
                        red), con contrato de encargo y las garantías del RGPD. La base de datos está alojada
                        en la Unión Europea. Si algún proveedor trata datos fuera del Espacio Económico
                        Europeo, se hace con las garantías del capítulo V del RGPD (decisión de adecuación o
                        cláusulas contractuales tipo).
                    </li>
                </ul>
                <p>No se ceden datos a terceros con fines comerciales.</p>

                <h2>6. Tus derechos</h2>
                <p>
                    Puedes ejercer los derechos de <strong>acceso, rectificación, supresión, limitación,
                    oposición y portabilidad</strong> ante tu empresa, como responsable del tratamiento.
                    Desde la aplicación ya puedes consultar y exportar tu historial de fichajes y pedir
                    correcciones mediante incidencias.
                </p>
                <p>
                    Para cualquier otro derecho, entra en <strong>Mi perfil → Privacidad → Ejercer mis derechos</strong>.
                    Tu empresa debe responderte en el plazo de <strong>un mes</strong> desde la solicitud,
                    ampliable dos meses más en casos complejos avisándote antes (art. 12.3 RGPD). Si ya no
                    tienes acceso a la aplicación, dirígete por escrito al departamento de personal de tu empresa.
                </p>
                <p>
                    Algunos datos, como el registro de jornada, no pueden borrarse antes de que termine el
                    plazo legal de conservación.
                </p>
                <p>
                    Si crees que no se han respetado tus derechos, puedes presentar una reclamación ante la
                    Agencia Española de Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">www.aepd.es</a>).
                </p>

                <h2>7. Seguridad</h2>
                <p>
                    Las comunicaciones van cifradas (HTTPS), las credenciales sensibles se guardan cifradas
                    y puedes proteger tu cuenta con verificación en dos pasos desde tu perfil.
                </p>

                <p className="privacy-footer">
                    <Link to="/login">Ir al inicio de sesión</Link>
                </p>
            </article>
        </div>
    );
};

export default PrivacyPage;
