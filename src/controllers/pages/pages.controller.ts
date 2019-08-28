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
        BORS: {
            P: 'BSOS',
            W: 'BSIS',
            BR: 'BSSO',
            N: '',
        },
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
                let staticElementsStrArr = testPageArray;
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

                // Page Definition;
                const resolution = {
                    x: parseInt(pageResolution[0].replace(/["]/g, ''), 10),
                    y: parseInt(pageResolution[1].replace(/["]/g, ''), 10),
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
        const newArr: ElementSettings = {
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

            } else if (this.valuesTranslation[item]) {
                const translatedSetting = this.valuesTranslation[item];
                newArr.fixed.push(translatedSetting[itemValue]);
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

        const indexMatch = elementStr.match(/[a-zA-Z(]/);
        const startIndex = indexMatch ? indexMatch.index : elementStr.length;
        const startIndexChar = elementStr.charAt(startIndex);

        const positionStr = elementStr.substring(0, startIndex);

        const settingsStr = startIndexChar === '(' ? elementStr.substring(elementStr.indexOf('(') + 1, elementStr.indexOf(')')) : '';

        // hack to ensure only getting the after the settings part
        const bodyStr = elementStr.split(`(${settingsStr})`)[1];

        // get position
        const splitElement = positionStr.split(',');

        const settings = this.setSettings(settingsStr);

        // get optional body
        const body = {
          type: null,
          content: null,
        };


        if (bodyStr && bodyStr.charAt(0) !== ';') {

            body.type = bodyStr.charAt(0).replace('\r', '');
            if (bodyStr.length > 1) {
                // Exclude the additional quotation marks
                body.content = bodyStr.substring(1, bodyStr.length)
                  .replace(/[";]/g, '')
                  .replace('\r', '\n');
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
