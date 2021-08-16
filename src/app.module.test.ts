import * as app_module from "./app.module"
// @ponicode
describe("configure", () => {
    let inst: any

    beforeEach(() => {
        inst = new app_module.AppModule()
    })

    test("0", () => {
        let callFunction: any = () => {
            inst.configure(undefined)
        }
    
        expect(callFunction).not.toThrow()
    })
})
