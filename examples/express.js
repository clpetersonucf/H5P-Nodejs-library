require("@babel/core");
require("@babel/register");
require("babel-polyfill");

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const fsextra = require('fs-extra');
const shortid = require('shortid');

const JsonStorage = require('../src/json-storage').default;
const InMemoryStorage = require('../src/in-memory-storage');
const H5PEditorConfig = require('../src/config');
const LibraryManager = require('../src/library-manager');
const FileLibraryStorage = require('../src/file-library-storage');
const User = require('../test/mockups/user');
const TranslationService = require('../src/translation-service');
const FileStorage = require('../src/file-storage');
const H5PEditor = require('../src');

const start = async () => {
    const server = express();

    const config = new H5PEditorConfig(new JsonStorage(path.resolve('examples/config.json')));
    await config.load();

    const englishStrings = await fsextra.readJSON(`${path.resolve('')}/src/translations/en.json`);

    const h5pEditor = new H5PEditor(
        new FileStorage(`${path.resolve()}/h5p`),
        {
            baseUrl: '/h5p',
            ajaxPath: '/ajax?action=',
            libraryUrl: '/h5p/editor/', // this is confusing as it loads no library but the editor-library files (needed for the ckeditor)
            filesPath: '/h5p/content'
        },
        new InMemoryStorage(),
        config,
        new LibraryManager(new FileLibraryStorage(`${path.resolve('')}/h5p/libraries`)),
        new User(),
        new TranslationService(englishStrings)
    );

    const h5pRoute = '/h5p';

    server.use(bodyParser.json());
    server.use(
        bodyParser.urlencoded({
            extended: true
        })
    );
    server.use(
        fileUpload({
            limits: { fileSize: 50 * 1024 * 1024 }
        })
    );

    server.use(h5pRoute, express.static(`${path.resolve('')}/h5p`));

    server.get('/', (req, res) => {
        if (!req.query.contentId) {
            res.redirect(`?contentId=${shortid()}`);
        }
        h5pEditor.render(req.query.contentId)
            .then(page => res.end(page));
    });

    server.get('/params', (req, res) => {
        h5pEditor
            .loadH5P(req.query.contentId)
            .then(content => {
                res.status(200).json(content);
            })
            .catch(() => {
                res.status(404).end();
            });
    });

    server.get('/ajax', (req, res) => {
        const { action } = req.query;
        const { majorVersion, minorVersion, machineName, language } = req.query;

        switch (action) {
            case 'content-type-cache':
                h5pEditor.getContentTypeCache().then(contentTypeCache => {
                    res.status(200).json(contentTypeCache);
                });
                break;

            case 'libraries':
                h5pEditor
                    .getLibraryData(
                        machineName,
                        majorVersion,
                        minorVersion,
                        language
                    )
                    .then(library => {
                        res.status(200).json(library);
                    });
                break;

            default:
                res.status(400).end();
                break;
        }
    });

    server.post('/', (req, res) => {
        h5pEditor
            .saveH5P(
                req.query.contentId,
                req.body.params.params,
                req.body.params.metadata,
                req.body.library
            )
            .then(() => {
                res.status(200).end();
            });
    });

    server.post('/ajax', (req, res) => {
        const { action } = req.query;
        switch (action) {

            case 'libraries':
                h5pEditor.getLibraryOverview(req.body.libraries).then(libraries => {
                    res.status(200).json(libraries);
                });
                break;

            case 'files':
                h5pEditor
                    .saveContentFile(
                        req.body.contentId === '0'
                            ? req.query.contentId
                            : req.body.contentId,
                        JSON.parse(req.body.field),
                        req.files.file
                    )
                    .then(response => {
                        res.status(200).json(response);
                    });
                break;

            case 'library-install':
                h5pEditor.installLibrary(req.query.id)
                    .then(() => h5pEditor.getContentTypeCache()
                        .then(contentTypeCache => {
                            res.status(200).json({ success: true, data: contentTypeCache });
                        }))
                break;

            case 'library-upload':
                h5pEditor.uploadPackage(req.query.contentId, req.files.h5p.data)
                    .then(() => Promise.all([
                        h5pEditor.loadH5P(req.query.contentId),
                        h5pEditor.getContentTypeCache()
                    ])

                        .then(([content, contentTypes]) =>
                            res.status(200).json({
                                success: true,
                                data: {
                                    h5p: content.h5p,
                                    content: content.params.params,
                                    contentTypes
                                }
                            })))
                break;

            default:
                res.status(500).end('NOT IMPLEMENTED');
                break;
        }
    });

    server.listen(process.env.PORT || 8080, () => {
        console.log(`server running at http://localhost:${process.env.PORT || 8080}`);
    });
}

start();
