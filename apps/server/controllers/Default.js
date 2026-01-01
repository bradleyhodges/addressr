// import debug from 'debug';
import { getApiRoot as _getApiRoot } from "../service/DefaultService";
import { writeJson } from "../utils/writer.js";
// var logger = debug('api');

export function getApiRoot(request, res) {
    _getApiRoot()
        .then((response) => {
            res.setHeader("link", response.link.toString());
            res.setHeader("link-template", response.linkTemplate.toString());
            writeJson(res, response.body);
        })
        .catch((error) => {
            writeJson(res, error.body);
        });
}
