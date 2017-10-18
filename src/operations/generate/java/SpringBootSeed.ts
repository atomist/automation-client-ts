import { CommandHandler, Parameter, Tags } from "../../../decorators";
import { logger } from "../../../internal/util/logger";
import { Project, ProjectAsync } from "../../../project/Project";
import { doWithFiles } from "../../../project/util/projectUtils";
import { AllJavaFiles } from "./javaProjectUtils";
import { JavaSeed } from "./JavaSeed";
import { SpringBootProjectStructure } from "./SpringBootProjectStructure";

/**
 * Spring Boot seed project. Extends generic Java seed to renames Spring Boot package and class name.
 */
@CommandHandler("Spring Boot seed generator", ["java", "spring", "spring-boot", "generator"])
@Tags("java", "spring", "spring-boot", "generator")
export class SpringBootSeed extends JavaSeed {

    public static Name = "SpringBootSeed";

    @Parameter({
        displayName: "Class Name",
        description: "name for the service class",
        pattern: /^.*$/,
        validInput: "a valid Java class name, which contains only alphanumeric characters, $ and _" +
        " and does not start with a number",
        minLength: 1,
        maxLength: 50,
        required: false,
    })
    public serviceClassName: string = "RestService";

    public manipulate(project: Project): Promise<Project> {
        return super.manipulate(project)
            .then(p =>
                SpringBootProjectStructure.inferFromJavaSource(p)
                    .then(structure => {
                        if (structure) {
                            return this.renameClassStem(p, structure.applicationClassStem, this.serviceClassName);
                        } else {
                            console.log("WARN: Spring Boot project structure not found");
                            return p;

                        }
                    }),
            );
    }

    /**
     * Rename all instances of a Java class.  This method is somewhat
     * surgical when replacing appearances in Java code but brutal when
     * replacing appearances elsewhere, i.e., it uses `Project.recordReplace()`.
     *
     * @param project    project whose Java classes should be renamed
     * @param oldClass   name of class to move from
     * @param newClass   name of class to move to
     */
    protected renameClassStem<P extends ProjectAsync>(project: P,
                                                      oldClass: string, newClass: string): Promise<P> {
        logger.info("Replacing old class stem [%s] with [%s]", oldClass, newClass);
        return doWithFiles(project, AllJavaFiles, f => {
            if (f.name.includes(oldClass)) {
                f.recordRename(f.name.replace(oldClass, newClass));
                f.recordReplaceAll(oldClass, newClass);
            }
        })
            .then(files => project);
    }

}
