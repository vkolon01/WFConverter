export class PageElement {
    body?: {
        type?: string;
        content?: string;
    };
    settings?: ElementSettings;
    resolution: {
        left: number,
        top: number,
        right: number,
        bottom: number,
    };
}

export class ElementSettings {
    fixed: string[];
    variable: object;
}
