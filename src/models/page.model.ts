import {PageElement} from "./page-element.model";

export class Page {
    resolution: {
        x: number;
        y: number;
    };
    pageSettings?: object;
    multilineSettings?: {
        numOfElements: number;
        margin: number;
    };
    staticElements: PageElement[];
    multilineElements: PageElement[];
}
