'use strict';
const fs = require('fs');
const path = require('path');
const env = require("./env");
const csvParser = require('csv-parser');
const {databases, connectToDatabase} = require("./conections")
const XlsxPopulate = require('xlsx-populate');
const sql = require('mssql');
const AWS = require('aws-sdk');
const awsConfig = require('./aws-config.json');
const env_messages = require('./env_messages');
AWS.config.update({
    accessKeyId: awsConfig.ACCESS_KEY_ID,
    secretAccessKey: awsConfig.SECRET_ACCESS_KEY,
    region: awsConfig.REGION
});

/**
 * Serverless function to process a CSV file named 'proyeccion.csv' and transform its contents into an array.
 *
 * @param {object} event - The event object triggering the function.
 * @returns {object} - The response object containing the transformed data and event input.
 */
async function comparative_projection_vs_real_2022_2023() {
    const errorMessages = [];
    try {
        const filePath = path.join(__dirname, 'proyeccion.csv');
        const dataArray = await readCsvFile(filePath);

        const pool = await connectToDatabase(databases.db_Fk)

        for (let i = 0; i < dataArray.length; i++) {
            try {
                const data = dataArray[i];
                console.log(`Processing entry ${i + 1} out of ${dataArray.length}`);

                const result = await pool.request()
                    .input('semana', sql.TYPES.Int, data.Semana)
                    .input('anio', sql.TYPES.Int, data.Anio)
                    .input('idHuerto', sql.TYPES.Int, data.Codigo_Huerto)
                    .query(env.SCRIPTS.SCRIPT_GET_RECEPTION_ORCHARD_WEEK_YEAR);

                const receptions = result.recordset[0];
                data.ReceptionTotal = receptions.ReceptionTotal;
                data.ReceptionAceptada = receptions.ReceptionAceptada;
            } catch (error) {
                if (error.message.includes("Date record already exists")) {
                    errorMessages.push(`Entry ${i + 1}: ${error.message}`);
                } else {
                    errorMessages.push(`Error processing entry ${i + 1}: ${error.message}`);
                }
            }
        }

        await generateExcel(dataArray);

        await pool.close();
    } catch (error) {
        console.log(error);
        errorMessages.push(`General processing error: ${error.message}`);
    }
};

/**
 * Reads a CSV file and transforms its contents into an array of objects.
 *
 * @param {string} filePath - The path to the CSV file.
 * @returns {Promise<Array>} - A promise that resolves with the array of objects from the CSV.
 */
async function readCsvFile(filePath) {
    return new Promise((resolve, reject) => {
        const dataArray = [];

        fs.createReadStream(filePath)
            .pipe(csvParser())
            .on('data', (data) => {
                const processedData = {};
                let rowIsValid = true;

                for (const header of env.HEADERS) {
                    const key = header.name;
                    const required = header.required;
                    const processType = header.process;
                    const params = header.params || {};

                    if (data[key]) {
                        if (processType === 'sanitize') {
                            processedData[key] = required
                                ? normalizeAndSanitize(data[key], params.replaceSpaces, params.replaceDots)
                                : data[key];
                        } else if (processType === 'transformDateFormat') {
                            processedData[key] = transformDateFormat(data[key]);
                        } else if (processType === 'decimal') {
                            processedData[key] = transformAndValidateDecimal(data[key]);
                        } else if (processType === 'month') {
                            let month_and_year = separate_month_and_year(data[key])
                            processedData[key] = month_and_year.month;
                            processedData['Anio'] = month_and_year.year;
                        } else if (processType === 'none') {
                            processedData[key] = data[key];
                        }
                    } else if (required) {
                        rowIsValid = false;
                        break;
                    }
                }

                if (rowIsValid) {
                    dataArray.push(processedData);
                }
            })
            .on('end', () => {
                resolve(dataArray);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

/**
 * Normalizes and sanitizes a text by applying a series of transformations.
 * @param {string} text - The input text to be normalized and sanitized.
 * @param {boolean} replaceSpaces - Whether to replace spaces with underscores.
 * @param {boolean} replaceDots - Whether to remove periods.
 * @returns {string} - The normalized and sanitized text.
 */
function normalizeAndSanitize(text, replaceSpaces = false, replaceDots = true) {
    let result = text.toString().normalize("NFD");

    if (replaceDots) {
        result = result.replace(/[.,]/g, "");
    }

    result = result.toUpperCase();

    if (replaceSpaces) {
        result = result.replace(/\s+/g, "_");
    }

    result = result.replace(/[\u0300-\u036f]/g, "")
        .replace(/[\n\r]/g, "");

    return result;
}

/**
 * Transform data 'dd/mm/yyyy' to 'yyyy-mm-dd'.
 * @param {string} inputDate - date 'dd/mm/yyyy'.
 * @returns {string} return 'yyyy-mm-dd'
 * @throws {Error} If the input date format is invalid.
 */
function transformDateFormat(inputDate) {
    // Verificar si la fecha ya está en el formato deseado.
    if (/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
        return inputDate;
    }

    // Dividir la fecha de entrada en partes usando el separador '/'.
    const parts = inputDate.split('/');

    // Verificar si la fecha tiene tres partes (día, mes y año).
    if (parts.length !== 3) {
        throw new Error('Formato de fecha inválido. Debe ser dd/mm/yyyy.');
    }

    const day = parts[0];
    const month = parts[1];
    const year = parts[2];

    // Devolver la fecha transformada en formato 'yyyy-mm-dd'.
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Transforms and validates a value to ensure it's a valid decimal number.
 * If the value contains a comma as a decimal separator, it replaces it with a dot.
 * Then attempts to convert the value into a decimal number and validates if it's a valid number.
 * @param {string} value - The value to transform and validate.
 * @returns {number|null} - The value as a decimal number if valid, or null if not valid.
 */
function transformAndValidateDecimal(value) {
    // Replace comma with dot as the decimal separator
    const sanitizedValue = value.replace(',', '.');

    // Try to convert the value into a decimal number
    const parsedValue = parseFloat(sanitizedValue);

    // Validate if the converted value is a valid number
    if (!isNaN(parsedValue) && isFinite(parsedValue)) {
        return parsedValue; // Return the valid numeric value
    } else {
        return null; // Return null if the value is not valid
    }
}

/**
 * Separates the month and year from a formatted date string.
 *
 * @param {string} dateString - The formatted date string (e.g., 'jun-23').
 * @returns {Object} An object containing the separated month and year.
 * @throws {Error} If the input dateString is not in the expected format.
 */
function separate_month_and_year(dateString) {
    const months = {
        ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
        jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12
    };

    const [monthStr, yearStr] = dateString.toLowerCase().split('-');

    if (!months[monthStr] || isNaN(yearStr) || yearStr.length !== 2) {
        throw new Error('Invalid date format. Expected format: "mon-yy".');
    }

    const month = months[monthStr];
    const year = parseInt('20' + yearStr);

    return {
        month: month,
        year: year
    };
}

/**
 * Generates a single Excel file with sheets grouped by 'Nombre_Productor'.
 *
 * @param {Array} dataArray - An array of data objects to be processed.
 * @returns {void}
 */
async function generateExcel(dataArray) {
    const groupedData = {};  // To store data grouped by Nombre_Productor

    // Group data by Nombre_Productor
    dataArray.forEach(data => {
        if (!groupedData[data.Nombre_Productor]) {
            groupedData[data.Nombre_Productor] = [];
        }
        groupedData[data.Nombre_Productor].push(data);
    });

    try {
        const workbook = await XlsxPopulate.fromBlankAsync();

        // Create a sheet for each data group (productor)
        for (const nombreProductor in groupedData) {
            // Truncate the sheet name if it's longer than 31 characters
            const sheetName = nombreProductor.substring(0, 31);
            const sheet = workbook.addSheet(sheetName);
            const headers = Object.keys(groupedData[nombreProductor][0]);
            sheet.cell('A1').value([headers]);

            const rows = groupedData[nombreProductor].map(data => Object.values(data));
            sheet.cell('A2').value(rows);
        }

        const filename = 'comparacion_proyeccion_vs_real_2022_2023.xlsx';

        // Save the workbook to a local file
        const localFilePath = path.join(__dirname, filename);
        await workbook.toFileAsync(localFilePath);

        // Upload the file to S3
        const s3 = new AWS.S3();
        const s3Params = {
            Bucket: 'proyecciones',
            Key: filename,
            Body: fs.createReadStream(localFilePath),
        };
        await s3.upload(s3Params).promise();

        console.log('Excel file uploaded to S3 successfully');
    } catch (error) {
        console.error('Error generating and uploading Excel file:', error);
    }
}


// Execute the main command
comparative_projection_vs_real_2022_2023();
