import { Controller, Get, Param } from '@nestjs/common';
import {PageElement} from "../../models/page-element.model";
import {Page} from "../../models/page.model";
import {ElementSettings} from '../../models/page-element.model';
import oracledb = require('oracledb');



@Controller('pages')
export class PagesController {

    // Used for settings with multiple type values
    settingsTranslation = {
        TFON: {settings: ['FONT', 'TFCS', 'TFSZ', 'TFST']},
        TFST: {settings: ['TFBD', 'TFTS', 'TFUL']},
        TFIT: {settings: ['OFSV', 'OFSH'], divider: ''},
    };

    valuesTranslation = {
        TFST: {
            B: 'TFBD',
            I: 'TFTS',
            U: 'TFUL',
            multiline: true,
        },
        OFSH: {
            L: 'OSHL',
            C: 'OSHC',
            R: 'OSHR',
        },
        OFSV: {
            T: 'OSVT',
            C: 'OSVC',
            B: 'OSVB',
        },
    };

    settingMapping = {
        fixed: ['TFBD', 'TFTS', 'TFUL'],
        variable: ['PBRC', 'TFRC', 'TFON'],
    };

    @Get(':pageNumber')
    async getPage(@Param('pageNumber') pageNumber: string) {

        try {
            const pageAttr = await this.fetchPageByNumber(pageNumber);
            if (pageAttr) {
                const testPage = pageAttr as string;
                const testPageArray = testPage.split('\n');
                const pageResolution = testPageArray[0].split(',');
                const pageSettings = this.setSettings(testPageArray[1]);

                let multilineSettings;

                // find the multiline section
                let staticElementsStrArr = [];
                let multilineElementsStrArr = [];

                for (let i = 0; i < testPageArray.length; i++) {

                    // Find multiline element  ( TODO find end of header by missing semicolon )
                    if (testPageArray[i].charAt(0) === 'M') {
                        const splitElement = testPageArray[i].split(',');
                        const multilineSettingsArr = splitElement.slice(1, 3);
                        multilineSettings = {
                            numOfElements: multilineSettingsArr[0],
                            margin: multilineSettingsArr[1],
                        };

                        // Remove the multiline settings from the string
                        testPageArray[i] = splitElement.slice(3).join();

                        // Divide the static and multiline elements into two different arrays.
                        staticElementsStrArr = testPageArray.slice(0, i);
                        multilineElementsStrArr = testPageArray.slice(i);

                    }
                }

                const staticElements = [];
                const multilineElements = [];

                // refine static elements
                const staticPageElements = staticElementsStrArr.filter((element) => {
                    const splitElement = element.split(',');
                    return this.checkIfElement(splitElement.slice(0, 4));
                });
                staticPageElements.forEach(element => {

                    const elementObj = this.getElementSettings(element);
                    staticElements.push(elementObj);
                });

                // refine multiline elements
                const multilinePageElements = multilineElementsStrArr.filter((element) => {
                    const splitElement = element.split(',');
                    return this.checkIfElement(splitElement.slice(0, 4));
                });
                multilinePageElements.forEach(element => {

                    const elementObj = this.getElementSettings(element);
                    multilineElements.push(elementObj);
                });

                // Page Definition
                const resolution = {
                    x: parseInt(pageResolution[0], 10),
                    y: parseInt(pageResolution[1], 10),
                };
                const page: Page = {
                    resolution,
                    pageSettings,
                    staticElements,
                    multilineElements,
                    multilineSettings,
                };

                // Send the page response
                return page;
            } else {
                return 'no data';
            }
        } catch (e) {
            console.log(e);
            return 'no data';
        }
    }

    translateSettings(settings): ElementSettings {

        let fileChanged = false;
        let newArr: ElementSettings = {
            variable: {},
            fixed: settings.fixed,
        };

        Object.keys(settings.variable).forEach(item => {

            // get value array
            const itemValue = settings.variable[item];

            if (this.settingsTranslation[item] && this.settingsTranslation[item].settings) {
                const valueDivider = this.settingsTranslation[item].divider || this.settingsTranslation[item].divider === '' ? `${this.settingsTranslation[item].divider}` : /[,"]/;
                const settingValueArray = itemValue.split(valueDivider).filter(el => el.length > 0);

                fileChanged = true;
                // get setting names and apply the values in order
                this.settingsTranslation[item].settings.forEach((subSettingName, i) => {
                    if (settingValueArray[i]) {
                        const translatedSetting = this.valuesTranslation[subSettingName];
                        if (translatedSetting) {
                            if (translatedSetting.multiline) {
                                const settingCharacters = settingValueArray[i].split('');
                                settingCharacters.forEach(character => {
                                    if (translatedSetting[character]) {
                                        if (typeof translatedSetting[character] === 'string') {
                                            newArr.fixed.push(translatedSetting[character]);
                                        } else {
                                            const translatedName = translatedSetting[character].name;
                                            newArr.variable[translatedName] = translatedSetting[character].value;
                                        }
                                    }
                                });
                            } else if (translatedSetting[settingValueArray[i]]) {
                                if (typeof translatedSetting[settingValueArray[i]] === 'string') {
                                    newArr.fixed.push(translatedSetting[settingValueArray[i]]);
                                } else {
                                    const translatedName = translatedSetting[settingValueArray[i]].name;
                                    newArr.variable[translatedName] = translatedSetting[settingValueArray[i]].value;
                                }
                            }
                        } else {
                            newArr.variable[subSettingName] = settingValueArray[i];
                        }
                    }
                });

            } else {
               newArr.variable[item] = itemValue;
            }

        });
        return fileChanged ? this.translateSettings(newArr) : newArr;
    }

    setSettings(settingsStr: string): ElementSettings {
      // clean the possible newline special characters.

      const settingsArr = settingsStr.split(';');
      let settings: ElementSettings = {
          fixed: [],
          variable: {},
      } as ElementSettings;

      settingsArr.forEach(setting => {
            const settingName = setting.split('=')[0];
            const settingValue = setting.split('=')[1];
            settings.variable[settingName] = settingValue;
      });

      settings = this.translateSettings(settings);

      return settings;
    }

    getElementSettings(elementStr: string) {

        const positionStr = elementStr.substring(0, elementStr.indexOf('('));
        const settingsStr = elementStr.substring(elementStr.indexOf('(') + 1, elementStr.indexOf(')'));
        let bodyStr = elementStr.substring(elementStr.indexOf(')') + 1);

        // Remove only the last special character.

        // get position
        const splitElement = positionStr.split(',');

        const settings = this.setSettings(settingsStr);

        // get optional body
        const body = {
          type: null,
          content: null,
        };


        if (bodyStr && bodyStr.charAt(0) !== ';') {

            body.type = bodyStr.charAt(0);
            if (bodyStr.length > 1) {
                // Exclude the additional quotation marks
                body.content = bodyStr.substring(1, bodyStr.length).replace(/[";]/g, '');
            }
        }
        const elementObj: PageElement = {
            resolution: {
                left: parseInt(splitElement[0], 10),
                top: parseInt(splitElement[1], 10),
                right: parseInt(splitElement[2], 10),
                bottom: parseInt(splitElement[3], 10),
            },
            settings,
        };

        if (body.type) {
          elementObj.body = body;
        }
        return elementObj;
    }

    fetchPageByNumber(pageNumber) {
        return new Promise(async (resolve, reject) => {

            let mockdata = `"800,600
PBRC=98,114,155;CPBP=0732;CPNP=0
URGC=226,230,239
0,0,800,50(BORW=0;URGC=77,89,121)U;
0,50,800,51(BORW=0;URGC=33,44,68)U;
0,555,800,599(BORW=0;URGC=226,230,239)U;
0,510,800,554(BORW=0;URGC=226,230,239)U;
0,465,800,509(BORW=0;URGC=226,230,239)U;
0,420,800,464(BORW=0;URGC=226,230,239)U;
0,375,800,419(BORW=0;URGC=226,230,239)U;
0,330,800,374(BORW=0;URGC=226,230,239)U;
0,285,800,329(BORW=0;URGC=226,230,239)U;
0,240,800,284(BORW=0;URGC=226,230,239)U;
0,195,800,239(BORW=0;URGC=226,230,239)U;
0,150,800,194(BORW=0;URGC=226,230,239)U;
0,105,800,149(BORW=0;URGC=226,230,239)U;
0,51,800,52(BORW=0;URGC=172,181,202)U;
0,104,800,105(BORW=0;URGC=43,53,77)U;
8,5,73,25(BORW=0;TFRC=214,218,228;TBRC=77,89,121;TFIT=CL;TFON="Arial"0,22,B)t;
8,27,117,45(BORW=0;TFRC=214,218,228;TBRC=77,89,121;TFIT=CL;TFON="Arial"0,22,B)d;
185,8,600,41(BORW=0;TFRC=255,255,255;TFFC=255,17,255,0,0,0;TFRS=R;TBRC=77,89,121;TBKS=R;TFIT=CC;TFON="Arial"0,44,B)T"ПРИЛЕТ";
606,11,789,39(BORW=0;TFRC=214,218,228;TBRC=77,89,121;TFIT=CR;TFON="Arial"0,30,B)T"ARRIVALS";
5,57,136,101(BORW=0;TFRC=226,230,239;TBRC=98,114,155;TFIT=CL;TFON="Arial"0,18,B)T"Авиакомпания
Airline";
144,57,208,101(BORW=0;TFRC=226,230,239;TBRC=98,114,155;TFIT=CL;TFON="Arial"0,18,B)T"Рейс
Flight";
224,57,282,101(BORW=0;TFRC=226,230,239;TBRC=98,114,155;TFIT=CL;TFON="Arial"0,18,B)T"Время
Time";
287,57,472,101(BORW=0;TFRC=226,230,239;TBRC=98,114,155;TFIT=CL;TFON="Arial"0,18,B)T"Первоначальный
Origin";
500,57,560,101(BORW=0;TFRC=226,230,239;TBRC=98,114,155;TFIT=CL;TFON="Arial"0,18,B)T"Выход
Gate";
632,57,763,101(BORW=0;TFRC=226,230,239;TBRC=98,114,155;TFIT=CL;TFON="Arial"0,18,B)T"Примечание
Remarks";
137,59,138,99(BORW=0;URGC=172,181,202)U;
217,59,218,99(BORW=0;URGC=172,181,202)U;
279,59,280,99(BORW=0;URGC=172,181,202)U;
493,59,494,99(BORW=0;URGC=172,181,201)U;
559,58,560,98(BORW=0;URGC=172,181,202)U;
136,59,137,99(BORW=0;URGC=43,53,70)U;
216,59,217,99(BORW=0;URGC=43,53,70)U;
278,59,279,99(BORW=0;URGC=43,53,70)U;
492,59,493,99(BORW=0;URGC=43,53,70)U;
558,59,559,99(BORW=0;URGC=43,53,70)U;
566,57,624,101(BORW=0;TFRC=226,230,239;TBRC=98,114,155;TFIT=CL;TFON="Arial"0,18,B)T"Время
Latest";
624,59,625,99(BORW=0;URGC=43,53,70)U;
625,59,626,99(BORW=0;URGC=172,181,201)U
M,11,45,0,105,136,149(BORW=3;BBRC=0,0,0;BORS=P;URGC=226,230,239;TFRC=0,0,0;TBRC=226,230,239;TFIT=CC;IBRC=226,230,239;IBFC=226,230,239,255,255,255;IFIT=SVHF;IMAR=N);
139,108,221,148(BORW=0;TFRC=0,0,0;TBRC=226,230,239;TFIT=CC;TFON="Arial"0,20,B);
224,106,284,146(BORW=0;TFRC=65,82,120;TBRC=226,230,239;TFIT=CL;TFON="Arial"0,21,B);
284,106,487,146(BORW=0;CUTS=WR;TFRC=0,0,0;TBRC=226,230,239;TFIT=CL;TFON="Arial"0,18,B;TFNC="Arial"0,18,B);
502,107,548,147(BORW=0;BORS=BR;TFRC=0,0,0;TBRC=226,230,239;TFIT=CC;TFON="Arial"0,20,B);
563,107,612,147(BORW=0;TFRC=65,82,120;TBRC=226,230,239;TFIT=CL;TFON="Arial"0,21,B);
630,107,794,147(BORW=0;CUTS=WR;TFRC=65,82,120;TBRC=226,230,239;TFIT=CL;TFON="Arial"0,18,B;TFNC="Arial"0,18,B)
"`;

            return resolve(mockdata);

            if (pageNumber) {
                let connection;
                try {
                    connection = await oracledb.getConnection({
                        user : 'ROOT',
                        password : 'w3lcome',
                        connectString : 'VitaliKolontko41:1521/aosdb01'
                    });
                } catch (err) {
                    console.log("Error: ", err);
                    return reject(err);
                } finally {
                    if (connection) {
                        try {
                            await connection.execute(
                              `SELECT PAGE_DESCRIPTION FROM FIDSMON_PAGE_DESC WHERE key_page=${pageNumber}`, [],  ((err, result) => {
                                  if (err) {
                                      reject(err.message);
                                  } else {
                                      if (result && result.rows && result.rows[0] && result.rows[0][0]) {


                                         return resolve(result.rows[0][0]);
                                      } else {
                                         return reject('no data');
                                      }
                                  }
                              })
                            );
                        } catch (err) {
                           reject(err);
                        }
                    }
                }
            }
        });
    }

    checkIfElement(elementsArray: string[]): boolean  {
        let result = true;
        if (elementsArray.length < 4) {
            result = false;
        }
        elementsArray.forEach(element => {
            if (isNaN(parseInt(element, 10))) {
                result = false;
            }
        });
        return result;
    }
}
