'use strict';
//#region SCRIPTS
const script_get_reception_orchard_week_year = `
SELECT ISNULL(SUM(r.CantEsc), 0)  AS ReceptionTotal,
       ISNULL(SUM(r.Cantidad), 0) AS ReceptionAceptada
FROM Trazabilidad.dbo.Recepcion r
         INNER JOIN Trazabilidad.dbo.Huerto h ON r.idHuerto = h.id
WHERE DATEPART(WEEK, CONVERT(DATE, r.FechaRecepcion)) = @semana
  AND DATEPART(YEAR, CONVERT(DATE, r.FechaRecepcion)) = @anio
  AND h.idSAP = @idHuerto
  AND r.Estatus = 'Aceptada'
`

//#endregion

module.exports = {
    HEADERS: [
        {name: 'Temporada', required: true, process: 'none'},
        {name: 'Fruta', required: true, process: 'sanitize'},
        {name: 'Centro_acopio', required: true, process: 'sanitize'},
        {name: 'Estado', required: true, process: 'sanitize'},
        {name: 'PR_Productor', required: true, process: 'sanitize'},
        {name: 'Nombre_Productor', required: true, process: 'sanitize'},
        {name: 'Nombre_Huerto', required: true, process: 'sanitize'},
        {name: 'Codigo_Huerto', required: true, process: 'decimal'},
        {name: 'Hectareas', required: true, process: 'decimal'},
        {name: 'Mes', required: true, process: 'month'},
        {name: 'Semana', required: true, process: 'none'},
        {name: 'Cajas_proyectadas', required: true, process: 'decimal'},
        {name: 'Variedad', required: true, process: 'sanitize'},
        {name: 'Fecha_Update', required: true, process: 'transformDateFormat'},
    ],
    SCRIPTS: {
        SCRIPT_GET_RECEPTION_ORCHARD_WEEK_YEAR: script_get_reception_orchard_week_year
    },
    SECRET_MANAGER: {
        CONNECTION_DB_AWS: 'aws_database_credentials',
        CONNECTION_DB_FK: 'fk_database_credentials'
    },
    EMAILS: {
        AWS: 'email_projection@projection-tiveg.awsapps.com',
        PEDRO: 'pedro.mayorga@tiveg.com,',
        EDGAR: 'edgar.verduzco@tiveg.com',
    },
    REGION: 'us-east-1'
};